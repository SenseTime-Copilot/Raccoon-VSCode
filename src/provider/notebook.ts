import { window, ExtensionContext, NotebookCell, NotebookCellData, NotebookCellKind, NotebookCellOutput, NotebookCellOutputItem, NotebookController, NotebookControllerAffinity, NotebookData, NotebookDocument, NotebookSerializer, Uri, commands, notebooks, workspace } from "vscode";

import { sensecodeManager } from "../extension";
import { Message, ResponseEvent, Role } from "../sensecodeClient/src/CodeClient";
import { buildHeader } from "../utils/buildRequestHeader";
import { CacheItem, CacheItemType } from '../utils/historyCache';
import { ModelCapacity } from "./sensecodeManager";

const encoder = new TextEncoder();
const decoder = new TextDecoder();

class SenseCodeNotebookSerializer implements NotebookSerializer {
  deserializeNotebook(data: Uint8Array): NotebookData {
    try {
      let cells: NotebookCellData[] = [];
      let items = JSON.parse(decoder.decode(data)) as Array<CacheItem>;
      for (let item of items) {
        switch (item.type) {
          case CacheItemType.question:
            let cell = new NotebookCellData(NotebookCellKind.Code, item.value, "sensecode");
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
                q.outputs.push(new NotebookCellOutput([NotebookCellOutputItem.text(item.value, "text/markdown")]));
              } else {
                q.outputs.push(new NotebookCellOutput([NotebookCellOutputItem.error(JSON.parse(item.value))]));
              }
            }
            break;
          case CacheItemType.data:
            cells.push(new NotebookCellData(NotebookCellKind.Markup, item.value, "markdown"));
            break;
          default:
            break;
        }
      }
      return new NotebookData(cells);
    } catch (error) {
      return { cells: [] };
    }
  }

  serializeNotebook(data: NotebookData): Uint8Array {
    let result: Array<CacheItem> = [];
    let idx = 0;
    for (let cell of data.cells) {
      idx++;
      if (cell.kind === NotebookCellKind.Code) {
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
              let type = CacheItemType.answer;
              let value = decoder.decode(oi.data);
              if (oi.mime === 'text/markdown') {
              } else {
                type = CacheItemType.error;
              }
              let out: CacheItem = {
                id: idx,
                type,
                timestamp: "",
                name: "Assistant",
                value
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
    return encoder.encode(JSON.stringify(result, undefined, 2));
  }
}

class SenseCodeNotebookController {
  private controller: NotebookController;
  private cancel: AbortController = new AbortController();
  constructor(private readonly context: ExtensionContext, private readonly id: string, viewType: string) {
    this.controller = notebooks.createNotebookController(id, viewType, id);
    this.controller.supportsExecutionOrder = true;
    this.controller.supportedLanguages = ["sensecode"];
    this.controller.interruptHandler = (_notebook: NotebookDocument) => {
      if (this.cancel && !this.cancel.signal.aborted) {
        this.cancel.abort();
      }
    };
    this.controller.executeHandler = this.execute.bind(this);
    context.subscriptions.push(this.controller);
  }

  public setAffinity(notebook: NotebookDocument) {
    this.controller.updateNotebookAffinity(notebook, NotebookControllerAffinity.Preferred);
  }

  private async execute(cells: NotebookCell[], notebook: NotebookDocument, controller: NotebookController) {
    if (this.cancel.signal.aborted) {
      this.cancel = new AbortController();
    }
    for (let cell of cells) {
      await notebook.save();
      if (this.cancel && this.cancel.signal.aborted) {
        return;
      }
      let execution = controller.createNotebookCellExecution(cell);
      execution.executionOrder = cell.index + 1;

      let content = cell.document.getText();
      let result = "";

      execution.start(new Date().valueOf());
      execution.clearOutput();
      let history: Message[] = [];
      let aboveCells = notebook.getCells().filter((c, _i, _a) => {
        return c.index < cell.index;
      });
      for (let c of aboveCells) {
        if (c.outputs[0] && c.outputs[0].items[0]?.mime === 'text/markdown') {
          history.push({
            role: Role.user,
            content: c.document.getText()
          }, {
            role: Role.assistant,
            content: decoder.decode(c.outputs[0].items[0].data)
          });
        }
      }
      await new Promise((resolve, _reject) => {
        sensecodeManager.getCompletionsStreaming(
          ModelCapacity.assistant,
          {
            messages: [
              ...history,
              { role: Role.user, content: sensecodeManager.buildFillPrompt(ModelCapacity.assistant, '', content) || "" }
            ]
          },
          (event) => {
            let value: string | undefined = undefined;
            let data = event.data;
            if (data && data.choices && data.choices[0] && data.choices[0].message) {
              value = data.choices[0].message.content;
            }
            if (this.cancel && this.cancel.signal.aborted) {
              return;
            }
            switch (event.type) {
              case ResponseEvent.cancel: {
                if (result) {
                  let output = NotebookCellOutputItem.text(result, "text/markdown");
                  execution.appendOutput({ items: [output] });
                }
                execution.end(false, new Date().valueOf());
                resolve(undefined);
                break;
              }
              case ResponseEvent.finish:
              case ResponseEvent.data: {
                if (value) {
                  result += value;
                }
                break;
              }
              case ResponseEvent.error: {
                let err = new Error(value);
                err.stack = undefined;
                execution.appendOutput({ items: [NotebookCellOutputItem.error(err)] });
                execution.end(false, new Date().valueOf());
                this.cancel.abort();
                resolve(undefined);
                break;
              }
              case ResponseEvent.done: {
                let output = NotebookCellOutputItem.text(result, "text/markdown");
                execution.appendOutput({ items: [output] });
                execution.end(true, new Date().valueOf());
                resolve(undefined);
                break;
              }
            }
          },
          {
            headers: buildHeader(this.context.extension, "notebook"),
            signal: this.cancel.signal
          },
          this.id
        );
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
  static rigister(context: ExtensionContext) {
    context.subscriptions.push(workspace.registerNotebookSerializer(SenseCodeNotebook.notebookType, new SenseCodeNotebookSerializer()));
    for (let c of sensecodeManager.robotNames) {
      let ctrl = new SenseCodeNotebookController(context, c, SenseCodeNotebook.notebookType);
      if (!SenseCodeNotebook.defaultController) {
        SenseCodeNotebook.defaultController = ctrl;
      }
      context.subscriptions.push(ctrl);
    }
    context.subscriptions.push(commands.registerCommand("sensecode.notebook.new",
      () => {
        if (!context.extension.isActive) {
          return;
        }
        let rootUri: Uri | undefined = undefined;
        let defaultName = "Untitled";
        if (workspace.workspaceFolders && workspace.workspaceFolders.length > 0) {
          rootUri = workspace.workspaceFolders[0].uri;
        }

        let count = 0;
        function newfile(root: Uri, name: string) {
          let uri = Uri.joinPath(root, `${name}.scnb`);
          workspace.fs.stat(uri).then(
            (_stat) => {
              count++;
              newfile(root, `${defaultName}-${count}`);
            },
            () => {
              let enc = new TextEncoder();
              workspace.fs.writeFile(uri, enc.encode("")).then(
                () => {
                  workspace.openNotebookDocument(uri).then((d) => {
                    SenseCodeNotebook.defaultController?.setAffinity(d);
                    window.showNotebookDocument(d);
                  });
                },
                () => {
                  window.showErrorMessage(`Can not craete file ${uri.toString()}`, 'Close');
                }
              );
            }
          );
        }
        if (rootUri) {
          newfile(rootUri, defaultName);
        } else {
          // eslint-disable-next-line @typescript-eslint/naming-convention
          window.showSaveDialog({ filters: { 'SenseCode Notebook': ['scnb'] } }).then((uri) => {
            if (uri) {
              let enc = new TextEncoder();
              workspace.fs.writeFile(uri, enc.encode("")).then(
                () => {
                  workspace.openNotebookDocument(uri).then((d) => {
                    SenseCodeNotebook.defaultController?.setAffinity(d);
                    window.showNotebookDocument(d);
                  });
                },
                () => {
                  window.showErrorMessage(`Can not craete file ${uri.toString()}`, 'Close');
                }
              );
            }
          });
        }
      }
    ));
  }
}
