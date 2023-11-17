import { transpile } from "typescript";
import { Message, Role } from "../raccoonClient/src/CodeClient";
import { FileType, NotebookCellKind, NotebookData, Uri, workspace, window, ViewColumn } from "vscode";
import { raccoonManager } from "../extension";
import { ModelCapacity } from "./raccoonManager";

export interface Toolset {
  fn: { [key: string]: { func: (args: any) => Promise<Message>; description: string; parameters: { type: 'object'; properties: object } } };
}

class VscodeToolset implements Toolset {
  fn: { [key: string]: { func: (args: any) => Promise<Message>; description: string; parameters: { type: 'object'; properties: object } } };

  constructor() {
    this.fn = {
      input: {
        func: this._input,
        description: "",
        parameters: {
          type: "object",
          properties: {
            prompt: {
              type: "string",
              description: "Prompt information"
            }
          }
        }
      },
      files: {
        func: this._files,
        description: "",
        parameters: {
          type: "object",
          properties: {
          }
        }
      },
      show: {
        func: this._show,
        description: "",
        parameters: {
          type: "object",
          properties: {
            prompt: {
              type: "string",
              description: "Prompt information"
            }
          }
        }
      }
    };
  }

  private async _input(args: { prompt: string }): Promise<Message> {
    return window.showInputBox({ prompt: args.prompt }).then((value) => {
      return { role: Role.assistant, content: value || "" };
    });
  }

  private async _files(args: { recursive: number }): Promise<Message> {
    let n = 0;
    let maxdepth = args.recursive ?? 1;
    let wfs = workspace.workspaceFolders;
    if (wfs && wfs[0]) {
      let files: Uri[] = [];
      async function readFiles(uri: Uri) {
        n++;
        if (n > maxdepth) {
          return;
        }
        await workspace.fs.readDirectory(uri).then(async (fs) => {
          for (let v of fs) {
            if (v[1] === FileType.Directory) {
              await readFiles(Uri.joinPath(uri, v[0]));
            } else {
              files.push(Uri.joinPath(uri, v[0]));
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

  private _show(args: { path: string; beside?: boolean }): Promise<Message> {
    return new Promise<Message>((resolve, reject) => {
      workspace.openTextDocument(Uri.parse(args.path))
        .then((doc) => {
          window.showTextDocument(doc, args.beside ? ViewColumn.Beside : undefined)
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

class LlmToolset {
  fn: { [key: string]: { func: (args: any) => Promise<Message>; description: string; parameters: { type: 'object'; properties: object } } };

  constructor(private abortController?: AbortController, private readonly id?: string) {
    this.fn = {
      'completion': {
        func: this._completion,
        description: "",
        parameters: {
          type: "object",
          properties: {
          }
        }
      },
      'assistant': {
        func: this._assistant,
        description: "",
        parameters: {
          type: "object",
          properties: {
          }
        }
      }
    };
  }

  private async _completion(args: { prompt: string }): Promise<Message> {
    return raccoonManager
      .getCompletions(ModelCapacity.completion, { messages: [{ role: Role.completion, content: args.prompt }] }, { signal: this.abortController?.signal }, this.id)
      .then((resp) => {
        if (resp.choices[0]?.message) {
          return resp.choices[0]?.message;
        } else {
          throw Error();
        }
      });
  }

  private async _assistant(args: { messages: Message[] }): Promise<Message> {
    return raccoonManager
      .getCompletions(ModelCapacity.assistant, { messages: args.messages }, { signal: this.abortController?.signal }, this.id)
      .then((resp) => {
        if (resp.choices[0]?.message) {
          return resp.choices[0]?.message;
        } else {
          throw Error();
        }
      });
  }
}

class RaccoonContext {
  outputs: Message[];
  private constructor(private readonly toolset: { [key: string]: Toolset }, readonly output: { [key: number]: Message }) {
    this.outputs = Object.values(this.output);
  }

  static readonly proxyhandler: ProxyHandler<RaccoonContext> = {
    get(t, p, _r) {
      if (typeof (p) === 'string') {
        if (t.toolset[p]) {
          return t.toolset[p];
        }
        return t[p as keyof typeof t];
      }
    }
  };

  static create(toolset: { [key: string]: Toolset }, output: { [key: number]: Message }) {
    let ctx = new RaccoonContext(toolset, output);
    return new Proxy(ctx, RaccoonContext.proxyhandler);
  }
}

export class RaccoonRunner {

  static readonly proxyhandler: ProxyHandler<Toolset> = {
    get(t, p, _r) {
      if (typeof (p) === 'string') {
        if (t.fn[p]) {
          return t.fn[p].func;
        }
        return t[p as keyof typeof t];
      }
    }
  };

  static parseRaccoon(languageId: string, content: string): string {
    if (languageId === 'raccoon') {
      let lines = content.split('\n');
      let parameters: string[] = [];
      let toolset = '';
      let fn = '';
      for (let line of lines) {
        if (line.trim().startsWith("//")) {
          continue;
        }
        let p = /^@([A-Za-z]\w*)\.(\S*).*$/.exec(line);
        if (p) {
          toolset = p[1];
          fn = p[2];
        } else {
          parameters.push(line);
        }
      }
      return `(context: RaccoonContext): Promise<Message> => {\n` +
        `  let output = context.output;\n` +
        `  let outputs = context.outputs;\n` +
        `  return context.${toolset}.${fn}({\n` +
        `    ${parameters.join(',\n    ')}\n` +
        `  });\n` +
        `}`;
    } else {
      return content;
    }
  }

  static async run(output: { [key: number]: Message }, language: string, content: string, abortController?: AbortController): Promise<Message> {
    let gencode: string | undefined;
    if (content && content.length > 0) {
      gencode = RaccoonRunner.parseRaccoon(language, content);
      if (!gencode) {
        return Promise.reject("Illegal code");
      }
      let runableCode = transpile(`
      ({
          __cell_code__: (context: RaccoonContext): Promise<Message> =>
          {
            return new Promise<Message>((resolve, reject) => {
              resolve((${gencode})(context));
            });
          }
      })`);
      let runnalbe: any = eval(runableCode);
      let llm = new Proxy(new LlmToolset(abortController), RaccoonRunner.proxyhandler);
      let ide = new Proxy(new VscodeToolset(), RaccoonRunner.proxyhandler);
      let context = RaccoonContext.create({ llm, ide }, output);
      return runnalbe.__cell_code__(context).then((res: Message) => {
        return res;
      });
    } else {
      return Promise.reject("Null code");
    }
  }

  static runChain(doc: NotebookData, output: { [key: number]: Message }, abortController?: AbortController) {
    let codeContent = 'let fx: { [key: number]: (context: RaccoonContext)=> Promise<Message> } = {};\n\n';
    for (let idx in doc.cells) {
      if (doc.cells[idx].kind !== NotebookCellKind.Code || doc.cells[idx].metadata?.readonly) {
        continue;
      }
      let code = RaccoonRunner.parseRaccoon(doc.cells[idx].languageId, doc.cells[idx].value);
      codeContent += `fx[${idx}] = (${code})\n\n`;
    }
    let chain = `(context: RaccoonContext): Promise<Message> => {
    ${codeContent}
    let p = Promise.resolve({}) as Promise<Message>;
    for (let i in fx) {
      p = p.then(async () => {
        let f = fx[i];
        return f(context).then((output) => {
          context.output[i] = output;
          context.outputs.push(output);
          return output;
        });
      });
    }
    return p;
}
`;
    RaccoonRunner.run(output, 'typescript', chain, abortController).then((msg) => {
      console.log(msg.content);
    });
  }
}
