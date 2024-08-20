import * as vscode from "vscode";
import { parseMarkdown, writeCellsToMarkdown } from '../utils/markdownParser';
import { codeNotebookType, extensionNameKebab, raccoonConfig, raccoonManager, registerCommand } from "../globalEnv";
import { Message } from "../raccoonClient/CodeClient";
import { RaccoonRunner } from "./raccoonToolset";

const decoder = new TextDecoder();

const roleIcon: { [key: string]: string } = {
  'user': '😶',
  'assistant': '🦝'
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

class CodeNotebookController {
  private controller: vscode.NotebookController;

  constructor(context: vscode.ExtensionContext, private readonly robot: string, viewType: string) {
    this.controller = vscode.notebooks.createNotebookController(robot, viewType, robot);
    this.controller.supportsExecutionOrder = true;
    this.controller.supportedLanguages = ["typescript", "raccoon"];
    this.controller.executeHandler = this.execute.bind(this);
    context.subscriptions.push(this.controller);
  }

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
      let output: { [key: number]: Message } = {};
      for (let i = 0; i < cell.index; i++) {
        let ci = notebook.cellAt(i);
        if (ci.kind === vscode.NotebookCellKind.Markup) {
          let content = ci.document.getText();
          if (/^\s*\-{3,}\s*$/.test(content) || /^\s*\*{3,}\s*$/.test(content)) {
            output = {};
          }
        }
        if (ci.kind === vscode.NotebookCellKind.Markup || !ci.outputs[0]) {
          continue;
        }
        for (let m of ci.outputs[0].items) {
          if (m.mime === 'text/x-json') {
            let content = JSON.parse(decoder.decode(m.data));
            output[i] = content;
            break;
          }
        }
      }
      RaccoonRunner.run(output, cell.document.languageId, cell.document.getText(), execution.token).then((result: Message) => {
        if (result) {
          let outputItems = new vscode.NotebookCellOutput([
            vscode.NotebookCellOutputItem.text(`${roleIcon[result.role] || result.role} \`${new Date().toLocaleString()}\`\n\n${result.content}`, "text/markdown"),
            vscode.NotebookCellOutputItem.text(JSON.stringify(result, null, 2), "text/x-json")
          ]);
          execution.replaceOutput([outputItems]);
        }
        execution.end(true, Math.floor(new Date().getTime()));
      }).catch((err: string) => {
        let errResult = new vscode.NotebookCellOutput([vscode.NotebookCellOutputItem.stderr(err)]);
        execution.replaceOutput([errResult]);
        execution.end(false, Math.floor(new Date().getTime()));
      });
    }
  }

  dispose(): void {
  }
}

class CodeNotebookCellStatusBarItemProvider implements vscode.NotebookCellStatusBarItemProvider {
  onDidChangeCellStatusBarItems?: vscode.Event<void> | undefined;
  provideCellStatusBarItems(cell: vscode.NotebookCell, _token: vscode.CancellationToken): vscode.ProviderResult<vscode.NotebookCellStatusBarItem | vscode.NotebookCellStatusBarItem[]> {
    if (cell.document.languageId === 'raccoon') {
      let reg = new vscode.NotebookCellStatusBarItem('🦝', vscode.NotebookCellStatusBarAlignment.Right);
      reg.command = {
        title: '',
        command: "vscode.open",
        arguments: [
          vscode.Uri.parse(`${extensionNameKebab}://raccoon.transpile/${cell.document.uri.path}-${cell.index}.ts#${encodeURIComponent(cell.document.getText())}`)
        ]
      };
      reg.tooltip = raccoonConfig.t("Show Transpiled Typescript Code");
      reg.priority = -1;
      return [reg];
    }
  }
}

const notebookInitialContent =
  `## 开始使用 Raccoon Notebook

Raccoon Notebook 为您提供了交互式的代码执行体验，帮助您快速验证想法，或沉淀有用的流程。

在 Raccoon Notebook 中，您可以创建 \`Markdown\` 格式的单元格，来记录说明性文字，同时可以在其中穿插创建代码单元格，其中可以包含 \`Raccoon 指令\` 或 \`TypeScript\` 代码，并支持编辑修改和实时运行，快速查看输出结果。

### 支持的模块和接口

所有指令或接口皆会返回一个 \`Message\` 结构：

\`\`\`ts readonly
interface Message {
  role: string;
  content: string;
}
\`\`\`

Raccoon Notebook 为每个单元格提供了 \`RaccoonContext\` 上下文信息，其中提供了工具函数入口及已运行单元格的输出信息，其详细定义如下:

\`\`\`ts readonly
interface RaccoonContext {
  llm: any; // LLM 工具函数入口
  ide: any; // IDE 工具函数入口
  output: { // output 映射，可以通过执行后的输出索引号获取对应的消息
    [key: number]: Message; // 以 Cell Index 为 key 的输出消息映射
  };
  outputs: Message[]; // 前序所有输出消息的列表
}
\`\`\`

以下是当前支持的工具函数列表：

| Raccoon Directive   | TypeScript Interface                           | Description                                                                                 |
|---------------------|------------------------------------------------|---------------------------------------------------------------------------------------------|
| \`@llm.assistant\`    | \`llm.assistant({messages: Message[]})\`         | 调用远端语言模型问答接口, 参数为需要发送的对话消息列表, 最后一条消息的 \`role\` 必须为 \`user\` |
| \`@llm.completion\`   | \`llm.completion({prompt: string})\`             | 调用远端语言模型补全接口, 参数为需要发送的提示内容                                          |
| \`@ide.input\`        | \`ide.input({prompt: string})\`                  | 请求用户输入, 参数为提示信息内容                                                            |
| \`@ide.select\`       | \`ide.select({items: string[]; title: string})\` | 请求用户输入, 参数为提示信息内容                                                            |
| \`@ide.files\`        | \`ide.files({recursive: number})\`               | 列举当前工作目录文件, 参数为最大遍历深度                                                    |
| \`@ide.show\`         | \`ide.show({path: string; beside: boolean})\`    | 打开指定的文件, 参数为需要打开文件的路径, 及是否在侧边打开文件                              |

### \`Raccoon 指令\`

使用 \`Raccoon 指令\` 可以方便的调用 Raccoon 提供的远端语言模型、本地代理等能力，要使用 \`Raccoon 指令\`，首先创建一个代码单元格，并保证其语言类型是 \`Raccoon\`，在单元格内，可以使用如下形式来调用能力：

\`\`\`raccoon
// 调用 llm 的 assistant 能力回答用户问题
@llm.assistant // 指令格式 \`@<module>.<function>\`
messages: [{role: "user", content: "将'你好'翻译成英文"}] // 通过 \`output[]\` 来使用指定的上文信息
\`\`\`

保证网络和登录状态正常，执行以上单元格，即可获取远端语言模型的回复。

我们可以在后续单元格中使用 \`output\` 及 \`outputs\` 来引用上文输出:

\`\`\`raccoon
@llm.assistant
messages: [...outputs, {role: "user", content: "那法语呢?"}] // 通过 \`outputs\` 来使用上文全部信息
\`\`\`

\`Raccoon 指令\` 本质是将指令转译为下文将会介绍的 \`TypeScript\` 代码执行，可以点击单元格底部 \`🦝\` 可查看转译结果。

输出结果显示形式可以通过输出单元格前的配置菜单，按喜好切换:

* \`JSON (text/x-json)\`: 将输出的 \`Message\` 信息以 \`JSON\` 格式渲染
* \`Markdown (text/markdown)\`: 将输出的 \`Message\` 信息以 \`Markdown\` 格式渲染

### \`TypeScript\` 代码

为了实现具体功能，您可以在创建 \`Typescript\` 类型的代码单元格，并实现符合以下合约形式的代码：

\`\`\`ts
(context: RaccoonContext): Promise<Message> => {
  return context.llm.assistant({messages: [{role: 'user', content: "珠穆朗玛峰海拔是多少?"}]})
}
\`\`\`

\`\`\`ts
(context: RaccoonContext): Promise<Message> => {
  return context.llm.assistant({messages: [{role: 'user', content: "乞力马扎罗峰海拔是多少?"}]})
}
\`\`\`

借助 \`TypeScript\` 的强大表达能力，您可以自定义实现更多功能，比如用以下代码计算海拔差：

\`\`\`ts
// 海拔差计算器
(context: RaccoonContext): Promise<Message> => {
  return new Promise<Message>((resolve, reject) => {
    let h1 = /([0-9,]+)米/.exec(context.output[21].content);
    let h2 = /([0-9,]+)米/.exec(context.output[22].content);
    if (h1 && h2) {
      let h1num = parseInt(h1[0].replace(',', ''));
      let h2num = parseInt(h2[0].replace(',', ''));
      resolve({ role: '💻', content: \`\${h1num} - \${h2num} = \${h1num - h2num}\` });
    }
  });
}
\`\`\`

### 与本地 IDE 互动

通过与本地 IDE 的功能集成，我们可以使用 Raccoon Notebook 与 IDE 互动：

\`\`\`raccoon
@ide.files
recursive: 2
\`\`\`

\`\`\`raccoon
@ide.select
items: output[27].content.split('\\n')
title: "open file..."
\`\`\`

\`\`\`raccoon
@ide.select
items: ['yes', 'no']
title: "open beside?"
\`\`\`

\`\`\`raccoon
@ide.show
path: output[28].content
beside: output[29].content === 'yes'
\`\`\`

`;

export class CodeNotebook {
  static rigister(context: vscode.ExtensionContext) {
    context.subscriptions.push(vscode.workspace.registerNotebookSerializer(codeNotebookType, new CodeNotebookSerializer(), { transientOutputs: true }));
    for (let c of raccoonManager.robotNames) {
      if (c) {
        let ctrl = new CodeNotebookController(context, c, codeNotebookType);
        context.subscriptions.push(ctrl);
      }
    }
    context.subscriptions.push(vscode.workspace.registerTextDocumentContentProvider(extensionNameKebab, {
      provideTextDocumentContent(uri: vscode.Uri, _token: vscode.CancellationToken) {
        if (uri.authority !== "raccoon.transpile") {
          return;
        }
        let code = uri.fragment;
        let ts = RaccoonRunner.parseRaccoon('raccoon', code);
        if (ts) {
          return `interface Message {
  role: string;
  content: string;
}

interface RaccoonContext {
  llm: any;
  ide: any;
  output: {
    [key: number]: Message;
  };
  outputs: Message[];
}\n\n` + ts;
        }
      }
    }));
    context.subscriptions.push(vscode.notebooks.registerNotebookCellStatusBarItemProvider(codeNotebookType, new CodeNotebookCellStatusBarItemProvider()));
    registerCommand(context, "notebook.register", (ne: any) => {
      if (ne.notebookEditor) {
        vscode.workspace.fs.readFile(ne.notebookEditor.notebookUri).then((data) => {
          let content = decoder.decode(data);
          RaccoonRunner.runChain(parseMarkdown(content), {});
        });
      }
    });

    registerCommand(context, "notebook.new",
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
          let uri = vscode.Uri.joinPath(root, `${name}.rcnb`);
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
                    vscode.window.showNotebookDocument(d, { preview: false });
                  });
                },
                () => {
                  vscode.window.showErrorMessage(`Can not craete file ${uri.toString()}`, raccoonConfig.t("Close"));
                }
              );
            }
          );
        }
        if (rootUri) {
          newfile(rootUri, defaultName);
        } else {
          vscode.workspace.openNotebookDocument(codeNotebookType, parseMarkdown(notebookInitialContent)).then((doc: vscode.NotebookDocument) => {
            vscode.window.showNotebookDocument(doc, { preview: false });
          });
        }
      }
    );
  }
}
