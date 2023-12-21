import { workspace, ExtensionContext, Uri, FileType, commands, window, QuickPickItem, QuickPickItemKind, ThemeIcon, l10n } from 'vscode';
import { RaccoonEditorProvider } from '../provider/assitantEditorProvider';
import { RaccoonViewProvider } from '../provider/webviewProvider';

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export enum CacheItemType {
  question = "question",
  answer = "answer",
  error = "error",
  data = "data"
}

export interface CacheItem {
  id: number;
  timestamp: string;
  name: string;
  type: CacheItemType;
  instruction?: string;
  value: string;
}

export class HistoryCache {
  static registerCommand(context: ExtensionContext) {
    context.subscriptions.push(commands.registerCommand('raccoon.restoreHistory', (...args) => {
      let cacheDir = Uri.joinPath(context.globalStorageUri, 'history');
      HistoryCache.getHistoryList(context).then(async l => {
        let fl: QuickPickItem[] = [];
        for (let f of l) {
          await workspace.fs.stat(Uri.joinPath(cacheDir, f + ".json")).then(n => {
            fl.push({
              label: f,
              detail: `${new Date(n.ctime).toLocaleString()}`,
              buttons: [
                {
                  iconPath: new ThemeIcon("edit"),
                  tooltip: l10n.t("Rename")
                },
                {
                  iconPath: new ThemeIcon("trash"),
                  tooltip: l10n.t("Delete")
                }]
            });
          });
        }
        if (fl.length > 0) {
          fl.push(
            { label: '', kind: QuickPickItemKind.Separator },
            { label: l10n.t('Clear All History') }
          );
        }
        const quickPick = window.createQuickPick();
        quickPick.items = fl;
        quickPick.title = l10n.t("Manage history");
        quickPick.placeholder = l10n.t("Select a history to restore");
        quickPick.onDidHide(() => quickPick.dispose());
        quickPick.onDidTriggerItemButton((e) => {
          if (e.button.tooltip === l10n.t('Delete')) {
            let uri = Uri.joinPath(cacheDir, e.item.label + ".json");
            workspace.fs.delete(uri);
            quickPick.items = quickPick.items.filter(item => item.label !== e.item.label);
            if (quickPick.items.length === 2) {
              quickPick.items = [];
            }
          } else if (e.button.tooltip === l10n.t('Rename')) {
            quickPick.dispose();
            let oldName = e.item.label;
            function validateInput(value: string) {
              if (!value) {
                return undefined;
              }
              let m = /[^?:"<>\*\|\\\/]+/g.exec(value);
              if (m?.at(0) === value) {
                if (value === oldName) {
                  return undefined;
                }
                let newUri = Uri.joinPath(cacheDir, value + ".json");
                return workspace.fs.stat(newUri).then((_stat) => {
                  return l10n.t("File already exists");
                }, () => {
                  return undefined;
                });
              } else {
                return l10n.t("Invalid filename");
              }
            }
            window.showInputBox({ value: oldName, validateInput }).then(newName => {
              if (newName && newName !== oldName) {
                let uri = Uri.joinPath(cacheDir, oldName + ".json");
                let newUri = Uri.joinPath(cacheDir, newName + ".json");
                workspace.fs.rename(uri, newUri, { overwrite: false }).then(() => {
                  commands.executeCommand('raccoon.restoreHistory', ...args);
                });
              } else {
                commands.executeCommand('raccoon.restoreHistory', ...args);
              }
            });
          }
        });
        quickPick.onDidChangeSelection(selection => {
          if (selection[0]) {
            if (selection[0].label === l10n.t('Clear All History')) {
              HistoryCache.deleteAllCacheFiles(context);
              quickPick.dispose();
            } else {
              if (args[0]) {
                let editor = RaccoonEditorProvider.getEditor(args[0]);
                editor?.loadHistory(selection[0].label);
              } else {
                RaccoonViewProvider.loadHistory(selection[0].label);
              }
            }
            quickPick.dispose();
          }
        });
        quickPick.show();
      });
    }));
  }

  static getHistoryList(context: ExtensionContext): Thenable<string[]> {
    let cacheDir = Uri.joinPath(context.globalStorageUri, 'history');
    return workspace.fs.stat(cacheDir)
      .then((dir) => {
        if (dir.type !== FileType.Directory) {
          return [];
        }
        return workspace.fs.readDirectory(cacheDir)
          .then((files) => {
            return files.filter(([name, type]) => (type === FileType.File && name.endsWith(".json"))).map(([name]) => name.slice(0, name.length - 5));
          }, () => {
            return [];
          });
      }, () => {
        return [];
      });
  }

  static async deleteAllCacheFiles(context: ExtensionContext, force: boolean = false): Promise<void> {
    let cacheDir = Uri.joinPath(context.globalStorageUri, 'history');
    return new Promise(async (resolve, reject) => {
      if (force) {
        let files = await workspace.fs.readDirectory(cacheDir);
        files.forEach(async file => {
          await workspace.fs.delete(Uri.joinPath(cacheDir, file[0])).then(() => { }, () => { });
        });
        resolve();
      } else {
        window.showWarningMessage(l10n.t("This will delete all history. Are you sure?"), { modal: true }, l10n.t("OK")).then(async answer => {
          if (answer === l10n.t("OK")) {
            let files = await workspace.fs.readDirectory(cacheDir);
            files.forEach(async file => {
              await workspace.fs.delete(Uri.joinPath(cacheDir, file[0])).then(() => { }, () => { });
            });
            resolve();
          } else {
            reject();
          }
        });
      }
    });
  }

  constructor(private readonly context: ExtensionContext, private readonly id: string) {
  }

  get cacheFileId(): string {
    return this.id;
  }

  async appendCacheItem(data?: CacheItem): Promise<void> {
    let cacheDir = Uri.joinPath(this.context.globalStorageUri, 'history');
    let cacheUri = Uri.joinPath(cacheDir, this.id + ".json");
    return workspace.fs.stat(cacheDir)
      .then(() => {
        return workspace.fs.stat(cacheUri)
          .then(() => {
            if (!data) {
              return;
            }
            workspace.fs.readFile(cacheUri).then(content => {
              let items: Array<any> = JSON.parse(decoder.decode(content) || "[]");
              if (items) {
                workspace.fs.writeFile(cacheUri, new Uint8Array(encoder.encode(JSON.stringify([...items, data], undefined, 2))));
              } else {
                workspace.fs.writeFile(cacheUri, new Uint8Array(encoder.encode(JSON.stringify([data], undefined, 2))));
              }
            }, () => { });
          }, () => {
            return workspace.fs.writeFile(cacheUri, new Uint8Array(encoder.encode(JSON.stringify(data ? [data] : []))));
          });
      }, async () => {
        return workspace.fs.createDirectory(cacheDir)
          .then(() => {
            return workspace.fs.writeFile(cacheUri, new Uint8Array(encoder.encode(JSON.stringify(data ? [data] : []))));
          }, () => { });
      });
  }

  static async getCacheItems(context: ExtensionContext, id: string): Promise<Array<CacheItem>> {
    let cacheDir = Uri.joinPath(context.globalStorageUri, 'history');
    let cacheUri = Uri.joinPath(cacheDir, id + ".json");
    return workspace.fs.readFile(cacheUri).then(content => {
      try {
        let h: CacheItem[] = JSON.parse(decoder.decode(content) || "[]");
        let answerReady = false;
        return h.filter((v, idx, arr) => {
          if ((idx) >= arr.length) {
            answerReady = false;
            return false;
          } else if (v.type === CacheItemType.question && (idx + 1) < arr.length && arr[idx + 1].type === CacheItemType.answer) {
            answerReady = true;
            return true;
          } else if (answerReady && v.type === CacheItemType.answer) {
            answerReady = false;
            return true;
          } else {
            answerReady = false;
            return false;
          }
        });
      } catch {
        return [];
      }
    }, () => {
      return [];
    });
  }

  async removeCacheItem(id?: number): Promise<void> {
    let cacheDir = Uri.joinPath(this.context.globalStorageUri, 'history');
    let cacheUri = Uri.joinPath(cacheDir, this.id + ".json");
    return workspace.fs.readFile(cacheUri).then(content => {
      if (id) {
        let items: Array<any> = JSON.parse(decoder.decode(content) || "[]");
        let log = items.filter((v, _idx, _arr) => {
          return v.id !== id;
        });
        return workspace.fs.writeFile(cacheUri, new Uint8Array(encoder.encode(JSON.stringify(log, undefined, 2))));
      } else {
        return workspace.fs.writeFile(cacheUri, new Uint8Array(encoder.encode('[]')));
      }
    }, () => { });
  }
}
