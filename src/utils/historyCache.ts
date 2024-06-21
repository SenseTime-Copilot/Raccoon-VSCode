import { workspace, ExtensionContext, Uri, FileType, commands, window, QuickPickItem, QuickPickItemKind, ThemeIcon, TextDocument } from 'vscode';
import { RaccoonEditorProvider } from '../provider/assitantEditorProvider';
import { RaccoonViewProvider } from '../provider/webviewProvider';
import { raccoonConfig, registerCommand } from '../globalEnv';

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
  timestamp: number;
  name: string;
  type: CacheItemType;
  instruction?: string;
  value: string;
}

export class HistoryCache {
  static register(context: ExtensionContext) {
    registerCommand(context, "restoreHistory", (...args) => {
      let cacheDir = Uri.joinPath(context.globalStorageUri, 'history');
      HistoryCache.getHistoryList(context).then(async l => {
        let action: QuickPickItem[] = [];
        let fl: QuickPickItem[] = [];
        let fltemp: { ctime: number; item: QuickPickItem }[] = [];
        for (let f of l) {
          await workspace.fs.stat(Uri.joinPath(cacheDir, f + ".json")).then(n => {
            fltemp.push({
              ctime: n.ctime, item: {
                label: '$(git-commit) ' + f,
                detail: `$(kebab-vertical) ${new Date(n.ctime).toLocaleString()}`,
                buttons: [
                  {
                    iconPath: new ThemeIcon("go-to-file"),
                    tooltip: raccoonConfig.t("Preview")
                  },
                  /*{
                    iconPath: new ThemeIcon("play"),
                    tooltip: raccoonConfig.t("Replay")
                  },*/
                  {
                    iconPath: new ThemeIcon("edit"),
                    tooltip: raccoonConfig.t("Rename")
                  },
                  {
                    iconPath: new ThemeIcon("trash"),
                    tooltip: raccoonConfig.t("Delete")
                  }]
              }
            });
          });
        }
        fl = fltemp.sort((a, b) => {
          return b.ctime - a.ctime;
        }).map((item) => item.item);
        const quickPick = window.createQuickPick();
        if (fl.length > 0) {
          action = [
            { label: '$(close-all) ' + raccoonConfig.t('Clear All History') },
            { label: '', kind: QuickPickItemKind.Separator }
          ];
          quickPick.activeItems = [];
        }
        quickPick.items = fl.length > 0 ? [...action, ...fl] : [];
        quickPick.title = raccoonConfig.t("Manage history");
        quickPick.placeholder = raccoonConfig.t("Select a history to restore");
        quickPick.onDidHide(() => quickPick.dispose());
        quickPick.onDidTriggerItemButton((e) => {
          let fid = e.item.label.replace('$(git-commit) ', '');
          if (e.button.tooltip === raccoonConfig.t('Delete')) {
            let uri = Uri.joinPath(cacheDir, fid + ".json");
            workspace.fs.delete(uri);
            quickPick.items = quickPick.items.filter(item => item.label !== e.item.label);
            if (quickPick.items.length === 2) {
              quickPick.items = [];
            }
          } else if (e.button.tooltip === raccoonConfig.t('Rename')) {
            quickPick.dispose();
            let oldName = fid;
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
                  return raccoonConfig.t("File already exists");
                }, () => {
                  return undefined;
                });
              } else {
                return raccoonConfig.t("Invalid filename");
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
          } else if (e.button.tooltip === raccoonConfig.t('Preview')) {
            workspace.openTextDocument(Uri.joinPath(context.globalStorageUri, 'history', fid + ".json")).then((doc: TextDocument) => {
              window.showTextDocument(doc);
            });
          } else if (e.button.tooltip === raccoonConfig.t('Replay')) {
            if (args[0]) {
              let editor = RaccoonEditorProvider.getEditor(args[0]);
              editor?.loadHistory(fid, true);
            } else {
              RaccoonViewProvider.loadHistory(fid, true);
            }
          }
        });
        quickPick.onDidChangeSelection(selection => {
          if (selection[0]) {
            if (selection[0].label === '$(close-all) ' + raccoonConfig.t('Clear All History')) {
              HistoryCache.deleteAllCacheFiles(context);
              quickPick.dispose();
            } else {
              let fid = selection[0].label.replace('$(git-commit) ', '');
              if (args[0]) {
                let editor = RaccoonEditorProvider.getEditor(args[0]);
                editor?.loadHistory(fid);
              } else {
                RaccoonViewProvider.loadHistory(fid);
              }
            }
            quickPick.dispose();
          }
        });
        quickPick.show();
      });
    });
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
        window.showWarningMessage(
          raccoonConfig.t('Clear All History'),
          {
            modal: true,
            detail: raccoonConfig.t("Are you sure you want to permanently delete all history files? This action is irreversible!")
          },
          raccoonConfig.t("Delete")
        ).then(async answer => {
          if (answer === raccoonConfig.t("Delete")) {
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
              let items: Array<CacheItem> = JSON.parse(decoder.decode(content) || "[]");
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

  async getCacheItems(): Promise<Array<CacheItem>> {
    let cacheDir = Uri.joinPath(this.context.globalStorageUri, 'history');
    let cacheUri = Uri.joinPath(cacheDir, this.id + ".json");
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

  async getCacheItemWithId(id: number): Promise<Array<CacheItem>> {
    let cacheDir = Uri.joinPath(this.context.globalStorageUri, 'history');
    let cacheUri = Uri.joinPath(cacheDir, this.id + ".json");
    return workspace.fs.readFile(cacheUri).then(content => {
      try {
        let h: CacheItem[] = JSON.parse(decoder.decode(content) || "[]");
        return h.filter((v, _idx, _arr) => {
          return v.id === id;
        });
      } catch {
        return [];
      }
    }, () => {
      return [];
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
        let items: Array<CacheItem> = JSON.parse(decoder.decode(content) || "[]");
        let log = items.filter((v, _idx, _arr) => {
          return v.id !== id;
        });
        return workspace.fs.writeFile(cacheUri, new Uint8Array(encoder.encode(JSON.stringify(log, undefined, 2))));
      }
    }, () => { });
  }
}
