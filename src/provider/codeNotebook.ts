import * as vscode from "vscode";
import { transpile } from "typescript";
import { parseMarkdown, writeCellsToMarkdown } from '../utils/markdownParser';

import { sensecodeManager } from "../extension";
import { Message, Role } from "../sensecodeClient/src/CodeClient";
import { ModelCapacity } from "./sensecodeManager";

const decoder = new TextDecoder();

const roleIcon: { [key: string]: string } = {
  'user': '😶',
  'assistant': '🤖'
};

class CodeNotebookSerializer implements vscode.NotebookSerializer {
  deserializeNotebook(data: Uint8Array): vscode.NotebookData {
    let content = Buffer.from(data).toString('utf8');
    return parseMarkdown(content);
  }

  serializeNotebook(data: vscode.NotebookData): Uint8Array {
    const stringOutput = writeCellsToMarkdown(data);
    return Buffer.from(stringOutput);
  }
}

interface Agent {
  fn: { [key: string]: (...args: any) => Promise<Message> };
}

class VscodeAgent implements Agent {
  fn: { [key: string]: (...args: any) => Promise<Message> };

  constructor(private readonly exe: vscode.NotebookCellExecution) {
    this.fn = {
      'files': this.files,
      'show': this.show
    };
  }

  private async files(args: { recursive: number }): Promise<Message> {
    let n = 0;
    let maxdepth = args.recursive ?? 1;
    let wfs = vscode.workspace.workspaceFolders;
    if (wfs && wfs[0]) {
      let files: vscode.Uri[] = [];
      async function readFiles(uri: vscode.Uri) {
        n++;
        if (n > maxdepth) {
          return;
        }
        await vscode.workspace.fs.readDirectory(uri).then(async (fs) => {
          for (let v of fs) {
            if (v[1] === vscode.FileType.Directory) {
              await readFiles(vscode.Uri.joinPath(uri, v[0]));
            } else {
              files.push(vscode.Uri.joinPath(uri, v[0]));
            }
          }
        });
      }
      await readFiles(wfs[0].uri);
      let allfiles = files.map((v, _i, _a) => {
        return v.toString();
      });
      return { role: Role.user, content: allfiles.join('\n') };
    }
    return Promise.resolve({ role: Role.user, content: '' });
  }

  private show(args: { path: string; beside?: boolean }): Promise<Message> {
    return new Promise<Message>((resolve, reject) => {
      vscode.workspace.openTextDocument(vscode.Uri.parse(args.path))
        .then((doc) => {
          vscode.window.showTextDocument(doc, args.beside ? vscode.ViewColumn.Beside : undefined)
            .then((_) => {
              resolve({ role: Role.assistant, content: "ok" });
            }, () => {
              reject("showTextDocument failed");
            });
        }, () => {
          reject("openTextDocument failed");
        });
    });
  }
}

class LlmAgent {
  fn: { [key: string]: (...args: any) => Promise<Message> };
  private abortController: AbortController;

  constructor(private readonly exe: vscode.NotebookCellExecution, private readonly id: string) {
    this.abortController = new AbortController();
    exe.token.onCancellationRequested((_e) => {
      this.abortController.abort();
    });
    this.fn = {
      'user': this.user,
      'completion': this.completion,
      'assistant': this.assistant,
    };
  }

  private async completion(args: { prompt: string }): Promise<Message> {
    return sensecodeManager
      .getCompletions(ModelCapacity.completion, { messages: [{ role: Role.completion, content: args.prompt }] }, { signal: this.abortController.signal }, this.id)
      .then((resp) => {
        if (resp.choices[0]?.message) {
          return resp.choices[0]?.message;
        } else {
          throw Error();
        }
      });
  }

  private user(args: { content: string }): Promise<Message> {
    return Promise.resolve({ role: Role.user, content: args.content });
  }

  private async assistant(args: { messages: Message[] }): Promise<Message> {
    return sensecodeManager
      .getCompletions(ModelCapacity.assistant, { messages: args.messages }, { signal: this.abortController.signal }, this.id)
      .then((resp) => {
        if (resp.choices[0]?.message) {
          return resp.choices[0]?.message;
        } else {
          throw Error();
        }
      });
  }
}

interface NotebookContext {
  llm: any;
  ide: any;
  output: {
    [key: number]: Message;
  };
  outputs: Message[];
}

class CodeNotebookController {
  private controller: vscode.NotebookController;

  constructor(context: vscode.ExtensionContext, private readonly robot: string, viewType: string) {
    this.controller = vscode.notebooks.createNotebookController(robot, viewType, robot);
    this.controller.supportsExecutionOrder = true;
    this.controller.supportedLanguages = ["typescript", "sensecode"];
    this.controller.executeHandler = this.execute.bind(this);
    context.subscriptions.push(this.controller);
  }

  static readonly proxyhandler: ProxyHandler<Agent> = {
    get(t, p, _r) {
      if (typeof (p) === 'string') {
        return t.fn[p]?.bind(t);
      }
    }
  };

  execute(cells: vscode.NotebookCell[], notebook: vscode.NotebookDocument, controller: vscode.NotebookController) {
    for (const cell of cells) {
      let execution = controller.createNotebookCellExecution(cell);
      execution.executionOrder = cell.index;
      execution.start(new Date().getTime());
      execution.clearOutput();
      if (cell.metadata.readonly) {
        execution.end(undefined);
        continue;
      }
      let llm = new Proxy(new LlmAgent(execution, this.robot), CodeNotebookController.proxyhandler);
      let ide = new Proxy(new VscodeAgent(execution), CodeNotebookController.proxyhandler);
      let output: { [key: number]: Message } = {};
      let outputs: Message[] = [];
      for (let i = 0; i < cell.index; i++) {
        let ci = notebook.cellAt(i);
        if (ci.kind === vscode.NotebookCellKind.Markup || !ci.outputs[0]) {
          continue;
        }
        for (let m of ci.outputs[0].items) {
          if (m.mime === 'text/x-json') {
            let content = JSON.parse(decoder.decode(m.data));
            output[i] = content;
            outputs.push(content);
            break;
          }
        }
      }
      let ctx: NotebookContext = { llm, ide, output, outputs };
      this.compileAndRun(execution, ctx).then((result: vscode.NotebookCellOutput) => {
        execution.replaceOutput([result]);
        execution.end(true, Math.floor(new Date().getTime()));
      }).catch((err) => {
        execution.replaceOutput([err]);
        execution.end(false, Math.floor(new Date().getTime()));
      });
    }
  }

  private parseSenseCode(doc: vscode.TextDocument) {
    let lines = doc.lineCount;
    let parameters: string[] = [];
    let agent = '';
    let fn = '';
    for (let i = 0; i < lines; i++) {
      let line = doc.lineAt(i);
      if (line.isEmptyOrWhitespace) {
        break;
      }
      if (line.text.trim().startsWith("//")) {
        continue;
      }
      let p = /^@([A-Za-z]\w*)\.(\S*).*$/.exec(line.text);
      if (p) {
        agent = p[1];
        fn = p[2];
      } else {
        parameters.push(line.text);
      }
    }
    return `(context: NotebookContext): Promise<Message> => {\n` +
      `  let output = context.output;\n` +
      `  let outputs = context.outputs;\n` +
      `  return context.${agent}['${fn}']({\n` +
      `    ${parameters.join(',\n    ')}\n` +
      `  });\n` +
      `}`;
  }

  private compileAndRun(execution: vscode.NotebookCellExecution, ctx: NotebookContext): Promise<vscode.NotebookCellOutput> {
    let body: string = execution.cell.document.getText();
    let gencode: string | undefined;
    if (body && body.length > 0) {
      return new Promise<vscode.NotebookCellOutput>((resolve, reject) => {
        let code = '';
        if (execution.cell.document.languageId === 'sensecode') {
          gencode = this.parseSenseCode(execution.cell.document);
          if (!gencode) {
            return reject(new Error("Illegal code"));
          }
        } else if (execution.cell.document.languageId === 'typescript') {
          gencode = body;
        }
        code = transpile(`
          ({
              __cell_code__: (context: NotebookContext): Promise<Message> =>
              {
                return new Promise<Message>((resolve, reject) => {
                  resolve((${gencode})(context));
                });
              }
          })`);

        let runnalbe: any = eval(code);
        runnalbe.__cell_code__(ctx).then((output: Message) => {
          if (output) {
            let result = new vscode.NotebookCellOutput([
              vscode.NotebookCellOutputItem.text(`${roleIcon[output.role] || output.role} \`${new Date().toLocaleString()}\`\n\n${output.content}`, "text/markdown"),
              vscode.NotebookCellOutputItem.text(JSON.stringify(output, null, 2), "text/x-json")
            ]);
            if (gencode) {
              let comment = output.content
                .split('\n')
                .map((line, _idx, _arr) => { return `// ${line}`; })
                .join('\n');
              result.items.push(
                vscode.NotebookCellOutputItem.text(gencode + '\n' + comment, "text/x-typescript"),
              );
            }
            resolve(result);
          }
        }, (reason: string) => {
          let errResult = new vscode.NotebookCellOutput([vscode.NotebookCellOutputItem.stderr(reason + (gencode ? `\n\`\`\`typescript\n${gencode}\n\`\`\`` : ''))]);
          if (gencode) {
            errResult.items.push(vscode.NotebookCellOutputItem.text(gencode, "text/x-typescript"));
          }
          reject(errResult);
        });
      });
    } else {
      let errResult = new vscode.NotebookCellOutput([vscode.NotebookCellOutputItem.stderr("Illegal code" + (gencode ? `\n\`\`\`typescript\n${gencode}\n\`\`\`` : ''))]);
      if (gencode) {
        errResult.items.push(vscode.NotebookCellOutputItem.text(gencode, "text/x-typescript"));
      }
      return Promise.reject(errResult);
    }
  }

  dispose(): void {
  }
}

const notebookInitialContent =
  `## 开始使用 SenseCode Notebook

SenseCode Notebook 为您提供了交互式的代码执行体验，帮助您快速验证想法，或沉淀有用的流程。

在 SenseCode Notebook 中，您可以创建 Markdown 格式的单元格，来记录说明性文字，同时可以在其中穿插创建代码单元格，其中可以包含 \`SenseCode 指令\` 或 \`TypeScript\` 代码，并支持编辑修改和实时运行，快速查看输出结果。

### 支持的模块和接口

所有指令或接口皆会返回一个 \`Message\` 结构：

\`\`\`ts readonly
interface Message {
    role: string;
    content: string;
}
\`\`\`

以下是当前支持的指令和接口列表：

| SenseCode Directive | TypeScript Interface                        | Description                                                                                 |
|---------------------|---------------------------------------------|---------------------------------------------------------------------------------------------|
| \`@llm.user\`         | \`llm.user({content: string})\`               | 生成用户提示消息, 参数为用户消息内容                                                        |
| \`@llm.assistant\`    | \`llm.assistant({messages: Message[]})\`      | 调用远端语言模型问答接口, 参数为需要发送的对话消息列表, 最后一条消息的 \`role\` 必须为 \`user\` |
| \`@llm.completion\`   | \`llm.completion({messages: Message[]})\`     | 调用远端语言模型补全接口, 参数为需要发送的对话消息列表, 最后一条消息的 \`role\` 必须为 \`user\` |
| \`@ide.files\`        | \`ide.files({recursive: number})\`            | 列举当前工作目录文件, 参数为最大遍历深度                                                    |
| \`@ide.show\`         | \`ide.show({path: string; beside: boolean})\` | 打开指定的文件, 参数为需要打开文件的路径, 及是否在侧边打开文件                              |

SenseCode Notebook 为每个单元格提供了 \`NotebookContext\` 上下文信息，以便调用以上接口，其中同时也提供了当前单元格之前的已运行单元格的输出信息，其详细定义如下:

\`\`\`ts readonly
interface NotebookContext {
    llm: any;
    ide: any;
    output: { // output 映射，可以通过执行后的输出索引号获取对应的消息
        [key: number]: Message;
    };
    outputs: Message[]; // 前序所有输出消息的列表
}
\`\`\`

### \`SenseCode 指令\`

使用 \`SenseCode 指令\` 可以方便的调用 SenseCode 提供的远端语言模型、本地代理等能力，要使用 \`SenseCode 指令\`，首先创建一个代码单元格，并保证其语言类型是 \`SenseCode\`，在单元格内，可以使用如下形式来调用能力：

\`\`\`sensecode
// 调用 llm 的 assistant 能力回答用户问题
@llm.assistant // 指令格式 \`@<module>.<function>\`
messages: [{role: 'user', content: \`将'你好'翻译成英文\`}] // 参数
\`\`\`

保证网络和登录状态正常，执行以上单元格，即可获取远端语言模型的回复。

也可以使用上下文信息中的 \`output\` 及 \`outputs\` 来用于其后的问答:

\`\`\`sensecode
@llm.user
content: "那法语呢?"
\`\`\`

执行以上单元格，将输出一个用户指令，我们可以在后续单元格中使用其输出：

\`\`\`sensecode
@llm.assistant
messages: outputs // 通过 \`outputs\` 来使用上文全部信息
\`\`\`

保证网络和登录状态正常，执行以上单元格，即可获取远端语言模型的回复。

输出结果单元格的显示形式可以按喜好切换:

* \`JSON (text/x-json)\`: 将输出的 \`Message\` 信息以 \`JSON\` 格式渲染
* \`Markdown (text/markdown)\`: 将输出的 \`Message\` 信息以 \`Markdown\` 格式渲染
* \`Typescript (text/x-typescript)\`: 对于 \`SenseCode 指令\` 单元格，本质是将指令转译为下文将会介绍的 \`TypeScript\` 代码执行，该模式可查看体转译后的代码结果


### \`TypeScript\` 代码

为了实现具体功能，您可以在代码单元格内使用符合以下合约形式的 \`TypeScript\` 代码：

\`\`\`ts
// 海拔查询器
(context: NotebookContext): Promise<Message> => {
    return context.llm.user({content: '海拔是多少'})
}
\`\`\`

\`\`\`ts
(context: NotebookContext): Promise<Message> => {
    return context.llm.assistant({messages: [{role: 'user', content: "珠穆朗玛峰" + context.output[23].content}]})
}
\`\`\`

\`\`\`ts
(context: NotebookContext): Promise<Message> => {
    return context.llm.assistant({messages: [{role: 'user', content: "乞力马扎罗峰" + context.output[23].content}]})
}
\`\`\`

借助 \`TypeScript\` 的强大表达能力，您可以自定义实现更多功能，比如用以下代码计算海拔差：

\`\`\`ts
// 海拔差计算器
(context: NotebookContext): Promise<Message> => {
  return new Promise<Message>((resolve, reject) => {
      let h1 = /([0-9,]+)米/.exec(context.output[24].content);
      let h2 = /([0-9,]+)米/.exec(context.output[25].content);
      if (h1 && h2) {
          let h1num = parseInt(h1[0].replace(',', ''));
          let h2num = parseInt(h2[0].replace(',', ''));
          resolve({ role: '💻', content: \`\${h1num} - \${h2num} = \${h1num - h2num}\` });
      }
  });
}
\`\`\`

### 与本地 IDE 互动

通过与本地 IDE 的功能集成，我们可以使用 SenseCode Notebook 与 IDE 互动：

\`\`\`sensecode
@ide.files
recursive: 2
\`\`\`

\`\`\`sensecode
@ide.show
path: \`\${output[30].content.split('\\n')[0]}\`
beside: true
\`\`\`

`;

export class CodeNotebook {
  public static readonly notebookType = 'sensecode';
  static rigister(context: vscode.ExtensionContext) {
    context.subscriptions.push(vscode.workspace.registerNotebookSerializer(CodeNotebook.notebookType, new CodeNotebookSerializer(), { transientOutputs: true }));
    for (let c of sensecodeManager.robotNames) {
      if (c) {
        let ctrl = new CodeNotebookController(context, c, CodeNotebook.notebookType);
        context.subscriptions.push(ctrl);
      }
    }
    context.subscriptions.push(vscode.commands.registerCommand("sensecode.notebook.new",
      () => {
        if (!context.extension.isActive) {
          return;
        }
        let rootUri: vscode.Uri | undefined = undefined;
        let defaultName = "Untitled";
        if (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0) {
          rootUri = vscode.workspace.workspaceFolders[0].uri;
        }

        let count = 0;
        function newfile(root: vscode.Uri, name: string) {
          let uri = vscode.Uri.joinPath(root, `${name}.scnb`);
          vscode.workspace.fs.stat(uri).then(
            (_stat) => {
              count++;
              newfile(root, `${defaultName}-${count}`);
            },
            () => {
              let enc = new TextEncoder();
              vscode.workspace.fs.writeFile(uri, enc.encode(notebookInitialContent)).then(
                () => {
                  vscode.workspace.openNotebookDocument(uri).then((d) => {
                    vscode.window.showNotebookDocument(d);
                  });
                },
                () => {
                  vscode.window.showErrorMessage(`Can not craete file ${uri.toString()}`, vscode.l10n.t("Close"));
                }
              );
            }
          );
        }
        if (rootUri) {
          newfile(rootUri, defaultName);
        } else {
          // eslint-disable-next-line @typescript-eslint/naming-convention
          vscode.window.showSaveDialog({ filters: { 'SenseCode Notebook': ['scnb'] } }).then((uri) => {
            if (uri) {
              let enc = new TextEncoder();
              vscode.workspace.fs.writeFile(uri, enc.encode("")).then(
                () => {
                  vscode.workspace.openNotebookDocument(uri).then((d) => {
                    vscode.window.showNotebookDocument(d);
                  });
                },
                () => {
                  vscode.window.showErrorMessage(`Can not craete file ${uri.toString()}`, vscode.l10n.t("Close"));
                }
              );
            }
          });
        }
      }
    ));
  }
}
