import * as vscode from "vscode";

import { sensecodeManager } from "../extension";
import { Role } from "../sensecodeClient/src/CodeClient";
import { buildHeader } from "../utils/buildRequestHeader";
import { CacheItem, CacheItemType } from "./webviewProvider";

const encoder = new TextEncoder();
const decoder = new TextDecoder();

class SenseCodeNotebookSerializer implements vscode.NotebookSerializer {
  deserializeNotebook(data: Uint8Array): vscode.NotebookData {
    try {
      let cells: vscode.NotebookCellData[] = [];
      let items = JSON.parse(decoder.decode(data)) as Array<CacheItem>;
      for (let item of items) {
        switch (item.type) {
          case CacheItemType.question:
            let cell = new vscode.NotebookCellData(vscode.NotebookCellKind.Code, item.value, "sensecode");
            cell.metadata = { id: item.id };
            cells.push(cell);
            break;
          case CacheItemType.answer:
          case CacheItemType.error:
            let q = cells.find((v, _idx, _arr) => {
              if (v.metadata?.id === item.id) {
                return v;
              }
            });
            if (q) {
              if (!q.outputs) {
                q.outputs = [];
              }
              if (item.type === CacheItemType.answer) {
                q.outputs.push(new vscode.NotebookCellOutput([vscode.NotebookCellOutputItem.text(item.value, "text/markdown")]));
              } else {
                q.outputs.push(new vscode.NotebookCellOutput([vscode.NotebookCellOutputItem.error(new Error(item.value))]));
              }
            }
            break;
          case CacheItemType.data:
            cells.push(new vscode.NotebookCellData(vscode.NotebookCellKind.Markup, item.value, "text/markdown"));
            break;
          default:
            break;
        }
      }
      return new vscode.NotebookData(cells);
    } catch (error) {
      return { cells: [] };
    }
  }

  serializeNotebook(data: vscode.NotebookData): Uint8Array {
    let result: Array<CacheItem> = [];
    let idx = 0;
    for (let cell of data.cells) {
      idx++;
      if (cell.kind === vscode.NotebookCellKind.Code) {
        let item: CacheItem = {
          id: idx,
          type: CacheItemType.question,
          timestamp: "",
          name: "User",
          value: cell.value
        };
        result.push(item);
        if (cell.outputs && cell.outputs.length > 0) {
          for (let output of cell.outputs) {
            for (let oi of output.items) {
              let type = oi.mime === 'text/markdown' ? CacheItemType.answer : CacheItemType.error;
              let out: CacheItem = {
                id: idx,
                type,
                timestamp: "",
                name: "Assistant",
                value: decoder.decode(oi.data)
              };
              result.push(out);
            }
          }
        }
      } else {
        let item: CacheItem = {
          id: idx,
          type: CacheItemType.data,
          timestamp: "",
          name: "",
          value: cell.value
        };
        result.push(item);
      }
    }
    return encoder.encode(JSON.stringify(result));
  }
}

class SenseCodeNotebookController {
  private controller: vscode.NotebookController;
  constructor(context: vscode.ExtensionContext, private readonly id: string, viewType: string) {
    this.controller = vscode.notebooks.createNotebookController(id, viewType, id);
    this.controller.supportsExecutionOrder = true;
    this.controller.supportedLanguages = ["sensecode"];
    this.controller.executeHandler = this.execute.bind(this);
    context.subscriptions.push(this.controller);
  }

  public setAffinity(notebook: vscode.NotebookDocument) {
    this.controller.updateNotebookAffinity(notebook, vscode.NotebookControllerAffinity.Preferred);
  }

  private execute(cells: vscode.NotebookCell[], _notebook: vscode.NotebookDocument, controller: vscode.NotebookController) {
    for (let cell of cells) {
      let cancel = new AbortController();
      let execution = controller.createNotebookCellExecution(cell);
      execution.executionOrder = cell.index + 1;
      execution.token.onCancellationRequested(() => {
        cancel.abort();
      });

      let content = cell.document.getText();

      execution.start(new Date().valueOf());
      execution.clearOutput();
      sensecodeManager.getCompletions(
        {
          messages: [
            { role: Role.system, content: "" },
            { role: Role.user, content }
          ],
          stop: ["<|end|>"]
        },
        {
          headers: buildHeader("notebook"),
          signal: cancel.signal
        },
        this.id)
        .then((response) => {
          for (let r of response.choices) {
            execution.appendOutput(new vscode.NotebookCellOutput([
              vscode.NotebookCellOutputItem.text(r.message.content, "text/markdown"),
            ]));
          }
          execution.end(true, new Date().valueOf());
        }, (err) => {
          err.stack = undefined;
          let output = vscode.NotebookCellOutputItem.error(err);
          execution.appendOutput({ items: [output] });
          execution.end(false, new Date().valueOf());
        })
        .catch(e => {
          e.stack = undefined;
          let output = vscode.NotebookCellOutputItem.error(e);
          execution.appendOutput({ items: [output] });
          execution.end(false, new Date().valueOf());
        });
    }
  }

  dispose(): void {
    this.controller.dispose();
  }

}

export class SenseCodeNotebook {
  public static readonly notebookType = 'sensecode';
  private static defaultController: SenseCodeNotebookController;
  static rigister(context: vscode.ExtensionContext) {
    context.subscriptions.push(vscode.workspace.registerNotebookSerializer(SenseCodeNotebook.notebookType, new SenseCodeNotebookSerializer()));
    for (let c of sensecodeManager.clientsLabel) {
      let ctrl = new SenseCodeNotebookController(context, c, SenseCodeNotebook.notebookType);
      if (!SenseCodeNotebook.defaultController) {
        SenseCodeNotebook.defaultController = ctrl;
      }
      context.subscriptions.push(ctrl);
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
              vscode.workspace.fs.writeFile(uri, enc.encode("")).then(
                () => {
                  vscode.workspace.openNotebookDocument(uri).then((d) => {
                    SenseCodeNotebook.defaultController?.setAffinity(d);
                    vscode.window.showNotebookDocument(d);
                  });
                },
                () => {
                  vscode.window.showErrorMessage(`Can not craete file ${uri.toString()}`, 'Close');
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
                    SenseCodeNotebook.defaultController?.setAffinity(d);
                    vscode.window.showNotebookDocument(d);
                  });
                },
                () => {
                  vscode.window.showErrorMessage(`Can not craete file ${uri.toString()}`, 'Close');
                }
              );
            }
          });
        }
      }
    ));
  }
}
