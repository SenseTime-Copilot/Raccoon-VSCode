import { Message, Role } from "../../raccoonClient/CodeClient";
import { FileType, Uri, workspace, window, ViewColumn } from "vscode";
import { Toolset } from "../raccoonToolset";
import { CancellationToken } from "vscode";

export class VscodeToolset implements Toolset {
  fn: { [key: string]: { func: (args: any) => Promise<Message>; description: string; parameters: { type: 'object'; properties: object } } };

  constructor(cancel?: CancellationToken) {
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
      select: {
        func: this._select,
        description: "",
        parameters: {
          type: "object",
          properties: {}
        }
      },
      files: {
        func: this._files,
        description: "",
        parameters: {
          type: "object",
          properties: {}
        }
      },
      show: {
        func: this._show,
        description: "",
        parameters: {
          type: "object",
          properties: {}
        }
      }
    };
  }

  private async _input(args: { prompt: string }): Promise<Message> {
    return window.showInputBox({ prompt: args.prompt }).then((value) => {
      return { role: Role.assistant, content: value || "" };
    });
  }

  private async _select(args: { items: string[]; title?: string }): Promise<Message> {
    return window.showQuickPick(args.items, { title: args.title }).then((value) => {
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
