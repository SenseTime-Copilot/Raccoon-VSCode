import { ExtensionContext, languages, TextDocument, Position, MarkdownString, CompletionItem, CompletionItemKind, window, ViewColumn, Uri, workspace, CustomEditorProvider, CancellationToken, CustomDocument, CustomDocumentBackup, CustomDocumentBackupContext, CustomDocumentContentChangeEvent, CustomDocumentEditEvent, CustomDocumentOpenContext, Event, WebviewPanel, CustomReadonlyEditorProvider } from "vscode";
import { getDocumentLanguage } from "../utils/getDocumentLanguage";

const encoder = new TextEncoder();
const decoder = new TextDecoder();

interface SnippetItem {
  id: string;
  languageid: string;
  shortcut: string;
  code: string;
}

export class FavoriteCodeManager {
  private readonly cacheFile: string = "snippets.json";

  constructor(private readonly context: ExtensionContext) {
  }

  registerSavedSnippets() {
    this.getSnippetItems().then(ss => {
      for (let s of ss) {
        this.registerFavoriteCode(s);
      }
    })
  }

  async appendSnippetItem(data?: SnippetItem): Promise<void> {
    let snippetDir = Uri.joinPath(this.context.globalStorageUri, 'snippets');
    let snippetUri = Uri.joinPath(snippetDir, this.cacheFile);
    return workspace.fs.stat(snippetUri)
      .then(() => {
        return workspace.fs.stat(snippetUri)
          .then(() => {
            if (!data) {
              return;
            }
            workspace.fs.readFile(snippetUri).then(content => {
              let items: Array<any> = JSON.parse(decoder.decode(content) || "[]");
              if (items) {
                let cp = items.filter((v, _idx, _arr) => {
                  return v.id !== data.id;
                });
                workspace.fs.writeFile(snippetUri, new Uint8Array(encoder.encode(JSON.stringify([...cp, data], undefined, 2))));
              } else {
                workspace.fs.writeFile(snippetUri, new Uint8Array(encoder.encode(JSON.stringify([data], undefined, 2))));
              }
            }, () => { });
          }, () => {
            return workspace.fs.writeFile(snippetUri, new Uint8Array(encoder.encode(JSON.stringify(data ? [data] : []))));
          });
      }, async () => {
        return workspace.fs.createDirectory(snippetDir)
          .then(() => {
            return workspace.fs.writeFile(snippetUri, new Uint8Array(encoder.encode(JSON.stringify(data ? [data] : []))));
          }, () => { });
      });
  }

  async getSnippetItems(): Promise<Array<SnippetItem>> {
    let snippetDir = Uri.joinPath(this.context.globalStorageUri, 'snippets');
    let snippetUri = Uri.joinPath(snippetDir, this.cacheFile);
    return workspace.fs.readFile(snippetUri).then(content => {
      try {
        return JSON.parse(decoder.decode(content) || "[]");
      } catch {
        return [];
      }
    }, () => { return []; });
  }

  async removeSnippetItem(id?: string): Promise<void> {
    let snippetDir = Uri.joinPath(this.context.globalStorageUri, 'snippets');
    let snippetUri = Uri.joinPath(snippetDir, this.cacheFile);
    return workspace.fs.readFile(snippetUri).then(content => {
      if (id) {
        let items: Array<any> = JSON.parse(decoder.decode(content) || "[]");
        let log = items.filter((v, _idx, _arr) => {
          return v.id !== id;
        });
        return workspace.fs.writeFile(snippetUri, new Uint8Array(encoder.encode(JSON.stringify(log, undefined, 2))));
      } else {
        return workspace.fs.writeFile(snippetUri, new Uint8Array(encoder.encode('[]')));
      }
    }, () => { });
  }

  async deleteSnippetFiles(): Promise<void> {
    let snippetsDir = Uri.joinPath(this.context.globalStorageUri, 'snippets');
    return workspace.fs.stat(snippetsDir)
      .then(() => {
        workspace.fs.delete(snippetsDir, { recursive: true });
      });
  }

  async addFavoriteCodeSnippet(id: string, languageid: string, code: string) {
    let panel = window.createWebviewPanel("sensecode.favorite", `SenseCode Snippet [${id}]`, ViewColumn.Active, { enableScripts: true });
    let webview = panel.webview;
    webview.options = {
      enableScripts: true
    };
    webview.onDidReceiveMessage((msg) => {
      switch (msg.type) {
        case 'save': {
          this.appendSnippetItem({ id, languageid, shortcut: msg.shortcut, code: msg.code });
          this.registerFavoriteCode({ id, languageid, shortcut: msg.shortcut, code: msg.code });
          panel.dispose();
          break;
        }
        case 'cancel': {
          panel.dispose();
          break;
        }
      }
    });

    let snippets = await this.getSnippetItems();
    let exist = snippets.filter((v) => { return v.id === id; });
    const toolkitUri = webview.asWebviewUri(Uri.joinPath(this.context.extensionUri, "media", "toolkit.js"));
    const mainCSS = webview.asWebviewUri(Uri.joinPath(this.context.extensionUri, 'media', 'main.css'));
    const iconUri = webview.asWebviewUri(Uri.joinPath(this.context.extensionUri, 'media', 'MaterialSymbols', 'materialSymbols.css'));

    webview.html = `
    <html>
    <head>
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; font-src ${webview.cspSource};  style-src ${webview.cspSource} 'unsafe-inline'; script-src ${webview.cspSource} 'unsafe-inline';" >
    <script type="module" src="${toolkitUri}"></script>
    <link href="${iconUri}" rel="stylesheet" />
    <link href="${mainCSS}" rel="stylesheet" />
    <script>
    const vscode = acquireVsCodeApi();
    function save() {
      var shortcut = document.getElementById("shortcut").value;
      var code = document.getElementById("codesnippet").value;
      vscode.postMessage(
        {
          "type": "save",
          "shortcut": shortcut,
          "code": code
        }
      )
    }
    function cancel() {
      vscode.postMessage(
        {
          "type": "cancel"
        }
      )
    }
    window.onload = (event) => {
      var codesnippet = document.getElementById("codesnippet");
      codesnippet.value = ${JSON.stringify(code)};
      var shortcutNode = document.getElementById("shortcut");
      var saveNode = document.getElementById("save");
      shortcutNode.addEventListener("input", (_e)=>{
        if (/^[a-zA-Z]\\w{3,16}$/.test(shortcutNode.value)){
        saveNode.disabled = false;
        } else {
        saveNode.disabled = true;
        }            
      });
    };
    </script>
    </head>
    <body>
    <div class="markdown-body" style="margin: 1rem 4rem;">
      <h2>Add code snippet to favorite list</h2>
      <div style="display: flex;flex-direction: column;">
        <div class="prompt" style="display: flex; grid-gap: 1rem;">
          <vscode-text-field style="flex-grow: 3; font-family: var(--vscode-editor-font-family);" id="shortcut" maxlength="16" ${exist[0] ? `value="${exist[0].shortcut}"` : ""}>Shortcut</vscode-text-field>
          <vscode-text-field style="flex-grow: 1; font-family: var(--vscode-editor-font-family);" disabled value="${getDocumentLanguage(languageid)}">Programming Language</vscode-text-field>
        </div>
        <vscode-text-area id="codesnippet" rows="20" resize="vertical" style="margin: 1rem 0; font-family: var(--vscode-editor-font-family);">
        Snippet
        </vscode-text-area>
        <div style="display: flex; align-self: flex-end; grid-gap: 1rem;">
          <vscode-button appearance="secondary" onclick="cancel()" style="--button-padding-horizontal: 2rem;">Cancel</vscode-button>
          <vscode-button id="save" disabled onclick="save()" style="--button-padding-horizontal: 2rem;">Save</vscode-button>
        </div>
      </div>
      </div>
    </body>
    </html>`;
  }

  async listCodeSnippets() {
    let panel = window.createWebviewPanel("sensecode.favorite", `SenseCode Snippets`, ViewColumn.Active, { enableScripts: true });
    let webview = panel.webview;
    webview.options = {
      enableScripts: true
    };
    webview.onDidReceiveMessage((msg) => {
      switch (msg.type) {
        case 'edit': {
          this.getSnippetItems().then((snippets) => {
            let snippet = snippets.filter(v => { return v.id === msg.id; });
            if (snippet[0]) {
              this.addFavoriteCodeSnippet(snippet[0].id, snippet[0].languageid, snippet[0].code);
            }
          });
          break;
        }
        case 'delete': {
          this.removeSnippetItem(msg.id);
          break;
        }
      }
    });
    const toolkitUri = webview.asWebviewUri(Uri.joinPath(this.context.extensionUri, "media", "toolkit.js"));
    const mainCSS = webview.asWebviewUri(Uri.joinPath(this.context.extensionUri, 'media', 'main.css'));
    const iconUri = webview.asWebviewUri(Uri.joinPath(this.context.extensionUri, 'media', 'MaterialSymbols', 'materialSymbols.css'));

    let snippets: SnippetItem[] = await this.getSnippetItems();

    let table = `
    <vscode-data-grid aria-label="Basic" generate-header="sticky" grid-template-columns="18ch 18ch 18ch 1fr 12ch" style="--font-family: var(--vscode-editor-font-family); border-bottom: 1px solid; border-color: var(--dropdown-border);">
      <vscode-data-grid-row row-type="sticky-header">
        <vscode-data-grid-cell cell-type="columnheader" grid-column="1">ID</vscode-data-grid-cell>
        <vscode-data-grid-cell cell-type="columnheader" grid-column="2">Language</vscode-data-grid-cell>
        <vscode-data-grid-cell cell-type="columnheader" grid-column="3">Shortcut</vscode-data-grid-cell>
        <vscode-data-grid-cell cell-type="columnheader" grid-column="4">Snippet</vscode-data-grid-cell>
        <vscode-data-grid-cell cell-type="columnheader" grid-column="5">Action</vscode-data-grid-cell>
      </vscode-data-grid-row>
    `;
    for (let s of snippets) {
      table += `
      <vscode-data-grid-row id="${s.id}" style="border-top: 1px solid; border-color: var(--dropdown-border);">
        <vscode-data-grid-cell grid-column="1" style="align-self: center;">${s.id}</vscode-data-grid-cell>
        <vscode-data-grid-cell grid-column="2" style="align-self: center;">${getDocumentLanguage(s.languageid)}</vscode-data-grid-cell>
        <vscode-data-grid-cell grid-column="3" style="align-self: center;">${s.shortcut}</vscode-data-grid-cell>
        <vscode-data-grid-cell grid-column="4" style="align-self: center; overflow: scroll; white-space: pre;">${s.code}</vscode-data-grid-cell>
        <vscode-data-grid-cell grid-column="5" style="align-self: center;">
        <vscode-link>
            <span class="material-symbols-rounded edit-snippet" onclick="editSnippet('${s.id}')">edit</span>
          </vscode-link>
          <vscode-link>
            <span class="material-symbols-rounded delete-snippet" onclick="deleteById('${s.id}')">delete</span>
          </vscode-link>
        </vscode-data-grid-cell>
      </vscode-data-grid-row>
      `;
    }
    table += '</vscode-data-grid>';

    webview.html = `
    <html>
    <head>
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; font-src ${webview.cspSource};  style-src ${webview.cspSource} 'unsafe-inline'; script-src ${webview.cspSource} 'unsafe-inline';" >
    <script type="module" src="${toolkitUri}"></script>
    <link href="${iconUri}" rel="stylesheet" />
    <link href="${mainCSS}" rel="stylesheet" />
    <script>
    const vscode = acquireVsCodeApi();
    function editSnippet(id) {
      vscode.postMessage(
        {
          "type": "edit",
          "id": id
        }
      )
    }
    function deleteById(id) {
      document.getElementById(id).remove();
      vscode.postMessage(
        {
          "type": "delete",
          "id": id
        }
      )
    }
    </script>
    </head>
    <body>
    <div class="markdown-body" style="margin: 1rem 4rem;">
      <h2>Favorite Snippet List</h2>
      <div style="display: flex;flex-direction: column;">
        ${table}
      </div>
      </div>
    </body>
    </html>`;
  }

  private registerFavoriteCode(snippet: SnippetItem) {
    const provider = languages.registerCompletionItemProvider(
      snippet.languageid,
      {
        provideCompletionItems(document: TextDocument, position: Position) {
          const linePrefix = document.lineAt(position).text.slice(0, position.character);
          if (!linePrefix.endsWith(snippet.shortcut)) {
            return undefined;
          }

          let doc = new MarkdownString(`\`\`\`${snippet.languageid}\n${snippet.code}\n\`\`\`\n $(sensecode-icon) _from SenseCode favorite code snippets_`, true);

          let item = new CompletionItem(snippet.shortcut, CompletionItemKind.Snippet);
          item.insertText = snippet.code;
          item.documentation = doc;

          return [
            item
          ];
        }
      }
    );
    this.context.subscriptions.push(provider);
  }
}