import { transpile } from "typescript";
import { Message } from "../raccoonClient/CodeClient";
import { CancellationToken, NotebookCellKind, NotebookData } from "vscode";
import { VscodeToolset } from "./toolset/VscodeToolset";
import { LlmToolset } from "./toolset/LlmToolset";

export interface Toolset {
  fn: { [key: string]: { func: (args: any) => Promise<Message>; description: string; parameters: { type: 'object'; properties: object } } };
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

  static async run(output: { [key: number]: Message }, language: string, content: string, cancel?: CancellationToken): Promise<Message> {
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
      let llm = new Proxy(new LlmToolset(cancel), RaccoonRunner.proxyhandler);
      let ide = new Proxy(new VscodeToolset(cancel), RaccoonRunner.proxyhandler);
      let context = RaccoonContext.create({ llm, ide }, output);
      return runnalbe.__cell_code__(context).then((res: Message) => {
        return res;
      });
    } else {
      return Promise.reject("Null code");
    }
  }

  static runChain(doc: NotebookData, output: { [key: number]: Message }, cancel?: CancellationToken) {
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
    RaccoonRunner.run(output, 'typescript', chain, cancel).then((_msg) => {
      // console.log(msg.content);
    });
  }
}
