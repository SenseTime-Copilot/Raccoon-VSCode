import { workspace, ExtensionContext, Uri } from 'vscode';

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

  constructor(private readonly context: ExtensionContext, private readonly cacheFile: string) {

  }

  async appendCacheItem(data?: CacheItem): Promise<void> {
    let cacheDir = Uri.joinPath(this.context.globalStorageUri, 'cache');
    let cacheUri = Uri.joinPath(cacheDir, this.cacheFile);
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

  async getCacheItems(): Promise<Array<CacheItem>> {
    let cacheDir = Uri.joinPath(this.context.globalStorageUri, 'cache');
    let cacheUri = Uri.joinPath(cacheDir, this.cacheFile);
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
    }, () => { });
  }

  async removeCacheItem(id?: number): Promise<void> {
    let cacheDir = Uri.joinPath(this.context.globalStorageUri, 'cache');
    let cacheUri = Uri.joinPath(cacheDir, this.cacheFile);
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

  async deleteAllCacheFiles(): Promise<void> {
    let cacheDir = Uri.joinPath(this.context.globalStorageUri, 'cache');
    return workspace.fs.stat(cacheDir)
      .then(() => {
        workspace.fs.delete(cacheDir, { recursive: true });
      });
  }
}
