import { ExtensionContext, languages, TextDocument, Position, MarkdownString, CompletionItem, CompletionItemKind, window, Uri, workspace, CustomReadonlyEditorProvider, CancellationToken, CustomDocument, CustomDocumentOpenContext, WebviewPanel, commands, RelativePattern, FileSystemWatcher, Webview, Disposable, CompletionList, } from "vscode";
import { getDocumentLanguage } from "../utils/getDocumentLanguage";

const encoder = new TextEncoder();
const decoder = new TextDecoder();

interface SnippetItem {
  id: string;
  languageid?: string;
  shortcut?: string;
  code: string;
}

export class FavoriteCodeEditor implements CustomReadonlyEditorProvider, Disposable {
  private readonly cacheFile: string = "snippets.json";
  static readonly viweType: string = "sensecode.favorites";
  static instance?: FavoriteCodeEditor;
  private watcher?: FileSystemWatcher;
  private webview?: Webview;
  private snippetProviders: { [key: string]: Disposable } = {};

  private constructor(private readonly context: ExtensionContext) {
    this.init().then(() => {
      this.registerSavedSnippets();
    });
    this.watcher = workspace.createFileSystemWatcher(new RelativePattern(this.context.globalStorageUri, 'snippets/*.json'));
    this.watcher?.onDidChange((e) => {
      let snippetUri = Uri.joinPath(this.context.globalStorageUri, 'snippets', this.cacheFile);
      if (e.toString() === snippetUri.toString()) {
        for (let s in this.snippetProviders) {
          this.snippetProviders[s].dispose();
        }
        this.registerSavedSnippets();
        if (this.webview) {
          this.renderList(this.webview);
        }
      }
    });
  }

  dispose() {
    for (let s in this.snippetProviders) {
      this.snippetProviders[s].dispose();
    }
  }

  static register(context: ExtensionContext) {
    if (!FavoriteCodeEditor.instance) {
      FavoriteCodeEditor.instance = new FavoriteCodeEditor(context);
      context.subscriptions.push(window.registerCustomEditorProvider(FavoriteCodeEditor.viweType, FavoriteCodeEditor.instance));
      context.subscriptions.push(FavoriteCodeEditor.instance);
    }
  }

  private registerFavoriteCode(snippet: SnippetItem) {
    const provider = languages.registerCompletionItemProvider(
      { language: snippet.languageid },
      {
        provideCompletionItems(_document: TextDocument, _position: Position) {
          if (!snippet.shortcut) {
            return [];
          }
          let item = new CompletionItem(snippet.shortcut, CompletionItemKind.Snippet);
          item.insertText = snippet.code;
          item.documentation = new MarkdownString(`\`\`\`${snippet.languageid}\n${snippet.code}\n\`\`\`\n $(sensecode-icon) _from SenseCode favorite code snippets_`, true);
          return new CompletionList([item]);
        }
      }
    );
    this.snippetProviders[snippet.id] = provider;
  }

  private registerSavedSnippets() {
    this.getSnippetItems().then(ss => {
      for (let id in ss) {
        this.registerFavoriteCode(ss[id]);
      }
    });
  }

  private async init(clear?: boolean): Promise<void> {
    let snippetDir = Uri.joinPath(this.context.globalStorageUri, 'snippets');
    let snippetUri = Uri.joinPath(snippetDir, this.cacheFile);
    return workspace.fs.stat(snippetDir)
      .then(() => {
        return workspace.fs.stat(snippetUri)
          .then(() => {
            if (clear) {
              return workspace.fs.writeFile(snippetUri, new Uint8Array(encoder.encode(JSON.stringify({}))));
            }
          }, () => {
            return workspace.fs.writeFile(snippetUri, new Uint8Array(encoder.encode(JSON.stringify({}))));
          });
      }, async () => {
        return workspace.fs.createDirectory(snippetDir)
          .then(() => {
            return workspace.fs.writeFile(snippetUri, new Uint8Array(encoder.encode(JSON.stringify({}))));
          }, () => { });
      });
  }

  private async appendSnippetItem(data?: SnippetItem): Promise<void> {
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
              let items: { [key: string]: SnippetItem } = JSON.parse(decoder.decode(content) || "{}");
              items[data.id] = data;
              workspace.fs.writeFile(snippetUri, new Uint8Array(encoder.encode(JSON.stringify(items, undefined, 2))));
            }, () => { });
          }, () => {
            return workspace.fs.writeFile(snippetUri, new Uint8Array(encoder.encode(JSON.stringify({}))));
          });
      }, async () => {
        return workspace.fs.createDirectory(snippetDir)
          .then(() => {
            return workspace.fs.writeFile(snippetUri, new Uint8Array(encoder.encode(JSON.stringify({}))));
          }, () => { });
      });
  }

  private async getSnippetItems(id?: string): Promise<{ [key: string]: SnippetItem }> {
    let snippetDir = Uri.joinPath(this.context.globalStorageUri, 'snippets');
    let snippetUri = Uri.joinPath(snippetDir, this.cacheFile);
    return workspace.fs.readFile(snippetUri).then(content => {
      try {
        let allItems: { [key: string]: SnippetItem } = JSON.parse(decoder.decode(content) || "{}");
        if (!id) {
          return allItems;
        }
        let out: any = {};
        out[id] = allItems[id];
        return out;
      } catch {
        return [];
      }
    }, () => { return []; });
  }

  private async removeSnippetItem(id?: string): Promise<void> {
    let snippetDir = Uri.joinPath(this.context.globalStorageUri, 'snippets');
    let snippetUri = Uri.joinPath(snippetDir, this.cacheFile);
    return workspace.fs.readFile(snippetUri).then(content => {
      if (id) {
        let items: { [key: string]: SnippetItem } = JSON.parse(decoder.decode(content) || "{}");
        delete items[id];
        return workspace.fs.writeFile(snippetUri, new Uint8Array(encoder.encode(JSON.stringify(items, undefined, 2))));
      } else {
        return workspace.fs.writeFile(snippetUri, new Uint8Array(encoder.encode('{}')));
      }
    }, () => { });
  }

  static async deleteSnippetFiles(): Promise<void> {
    return FavoriteCodeEditor.instance?.init(true);
  }

  openCustomDocument(uri: Uri, _openContext: CustomDocumentOpenContext, _token: CancellationToken): CustomDocument {
    let item = JSON.parse(decodeURIComponent(uri.query));
    if (item.id === "all") {
      return {
        uri,
        dispose: () => {
          this.webview = undefined;
        }
      };
    }
    return {
      uri,
      dispose: () => {
      }
    };
  }

  resolveCustomEditor(document: CustomDocument, webviewPanel: WebviewPanel, _token: CancellationToken): void | Thenable<void> {
    let item = JSON.parse(decodeURIComponent(document.uri.query));
    if (item.id === "all") {
      this.webview = webviewPanel.webview;
      return this.favoriteCodeSnippetListPage(webviewPanel);
    } else {
      this.favoriteCodeSnippetEditorPage(webviewPanel, item);
    }
  }

  async favoriteCodeSnippetEditorPage(panel: WebviewPanel, snippet: SnippetItem) {
    let webview = panel.webview;
    webview.options = {
      enableScripts: true
    };
    webview.onDidReceiveMessage((msg) => {
      switch (msg.type) {
        case 'save': {
          this.appendSnippetItem(msg);
          panel.dispose();
          break;
        }
        case 'cancel': {
          panel.dispose();
          break;
        }
      }
    });

    let exist = await this.getSnippetItems(snippet.id);
    let shortcut;
    if (exist[snippet.id]) {
      shortcut = exist[snippet.id].shortcut;
    }
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
      var language = document.getElementById("language").value;
      var code = document.getElementById("codesnippet").value;
      vscode.postMessage(
        {
          "type": "save",
          "id": "${snippet.id}",
          "languageid": language,
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
      codesnippet.value = ${JSON.stringify(snippet.code)};
      var shortcutNode = document.getElementById("shortcut");
      var saveNode = document.getElementById("save");
      shortcutNode.addEventListener("input", (_e)=>{
        if (/^[a-zA-Z]\\w{3,16}$/.test(shortcutNode.value)){
        saveNode.disabled = false;
        } else {
        saveNode.disabled = true;
        }
      });
      shortcutNode.focus();
    };
    </script>
    </head>
    <body>
    <div class="markdown-body" style="margin: 1rem 4rem;">
      <h2>Favorite Snippet <vscode-badge style="opacity: 0.6">${snippet.id}</vscode-badge></h2>
      <div style="display: flex; flex-direction: column;">
        <div class="prompt" style="display: flex; grid-gap: 1rem;">
          <vscode-text-field id="shortcut" tabindex="1" placeholder="Start with a letter, with a length limit of 4-16 characters" style="white-space: normal; flex-grow: 3; font-family: var(--vscode-editor-font-family);" maxlength="16" ${shortcut && `value="${shortcut}"`}}>Shortcut<vscode-link slot="end" tabindex="-1" href="#" title="/^[a-zA-Z]\\w{3,16}$/">
              <span class="material-symbols-rounded">regular_expression</span>
            </vscode-link>
          </vscode-text-field>
          <vscode-text-field id="language" tabindex="2" list="languageid-list" placeholder="Language identifier" style="white-space: normal; flex-grow: 1; font-family: var(--vscode-editor-font-family);" ${snippet.languageid ? `value="${snippet.languageid}"` : ''}>Programming Language<vscode-link slot="end" tabindex="-1" href="https://code.visualstudio.com/docs/languages/identifiers#_known-language-identifiers" title="about language identifiers">
              <span class="material-symbols-rounded">help</span>
            </vscode-link>
          </vscode-text-field>
        </div>
        <vscode-text-area tabindex="3" id="codesnippet" rows="20" resize="vertical" style="margin: 1rem 0; font-family: var(--vscode-editor-font-family);">
        Snippet
        </vscode-text-area>
        <div style="display: flex; align-self: flex-end; grid-gap: 1rem;">
          <vscode-button tabindex="5" appearance="secondary" onclick="cancel()" style="--button-padding-horizontal: 2rem;">Cancel</vscode-button>
          <vscode-button tabindex="4" id="save" ${(shortcut && shortcut.length >= 4) ? '' : 'disabled'} onclick="save()" style="--button-padding-horizontal: 2rem;">Save</vscode-button>
        </div>
      </div>
      </div>
    </body>
    </html>`;
  }

  private async favoriteCodeSnippetListPage(panel: WebviewPanel) {
    let webview = panel.webview;
    webview.options = {
      enableScripts: true
    };
    webview.onDidReceiveMessage((msg) => {
      switch (msg.type) {
        case 'add': {
          let id = new Date().valueOf();
          let temp: SnippetItem = {
            id: `${id}`,
            code: ''
          };
          commands.executeCommand("vscode.openWith", Uri.parse(`sensecode://sensecode.favorites/${msg.id}.sensecode.favorites?${encodeURIComponent(JSON.stringify({ title: `Favorite Snipet [${id}]`, ...temp }))}`), FavoriteCodeEditor.viweType);
          break;
        }
        case 'edit': {
          this.getSnippetItems(msg.id).then((snippets) => {
            if (snippets[msg.id]) {
              commands.executeCommand("vscode.openWith", Uri.parse(`sensecode://sensecode.favorites/${msg.id}.sensecode.favorites?${encodeURIComponent(JSON.stringify({ title: `Favorite Snipet [${msg.id}]`, ...snippets[msg.id] }))}`), FavoriteCodeEditor.viweType);
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
    await this.renderList(webview);
  }

  private async renderList(webview: Webview) {
    const toolkitUri = webview.asWebviewUri(Uri.joinPath(this.context.extensionUri, "media", "toolkit.js"));
    const mainCSS = webview.asWebviewUri(Uri.joinPath(this.context.extensionUri, 'media', 'main.css'));
    const iconUri = webview.asWebviewUri(Uri.joinPath(this.context.extensionUri, 'media', 'MaterialSymbols', 'materialSymbols.css'));

    let snippets: { [key: string]: SnippetItem } = await this.getSnippetItems();

    let emptyPlaceholder = `
    <div style="text-align: center;margin: 10% 0; opacity: 0.3; user-select: none;">
      <span class="material-symbols-rounded" style="font-size: 4rem; font-variation-settings: 'FILL' 0, 'wght' 300, 'GRAD' 0, 'opsz' 48;">folder_open</span>
      <div style="font-family: var(--vscode-editor-font-family);">No Favorite Snippet</div>
    </div>`;
    let table = `
    <vscode-data-grid aria-label="Basic" generate-header="sticky" grid-template-columns="calc(16ch + 24px) calc(16ch + 24px) calc(16ch + 24px) 1fr 84px" style="--font-family: var(--vscode-editor-font-family); border-top: 1px solid; border-bottom: 1px solid; border-color: var(--dropdown-border); min-width: calc( 48ch + 380px);">
      <vscode-data-grid-row row-type="sticky-header">
        <vscode-data-grid-cell cell-type="columnheader" grid-column="1">ID</vscode-data-grid-cell>
        <vscode-data-grid-cell cell-type="columnheader" grid-column="2">Language</vscode-data-grid-cell>
        <vscode-data-grid-cell cell-type="columnheader" grid-column="3">Shortcut</vscode-data-grid-cell>
        <vscode-data-grid-cell cell-type="columnheader" grid-column="4">Snippet</vscode-data-grid-cell>
        <vscode-data-grid-cell cell-type="columnheader" grid-column="5">Action</vscode-data-grid-cell>
      </vscode-data-grid-row>
    `;
    for (let id in snippets) {
      emptyPlaceholder = '';
      let s = snippets[id];
      table += `
      <vscode-data-grid-row id="${s.id}" style="border-top: 1px solid; border-color: var(--dropdown-border);">
        <vscode-data-grid-cell grid-column="1" style="align-self: center;">${s.id}</vscode-data-grid-cell>
        <vscode-data-grid-cell grid-column="2" style="align-self: center;">${getDocumentLanguage(s.languageid || "")}</vscode-data-grid-cell>
        <vscode-data-grid-cell grid-column="3" style="align-self: center;">${s.shortcut}</vscode-data-grid-cell>
        <vscode-data-grid-cell grid-column="4" style="align-self: center; overflow-x: auto; white-space: pre;">${s.code.replace(/</g, "&lt;")}</vscode-data-grid-cell>
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
    <style>
    vscode-data-grid-cell:focus, vscode-data-grid-cell:focus-visible {
      border-color: transparent;
      background: inherit;
    }
    </style>
    <script>
    const vscode = acquireVsCodeApi();
    function addSnippet() {
      vscode.postMessage(
        {
          "type": "add"
        }
      )
    }
    function editSnippet(id) {
      vscode.postMessage(
        {
          "type": "edit",
          "id": id
        }
      )
    }
    function deleteById(id) {
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
      <div style="display: flex; justify-content: flex-end; margin: 0.5rem;">
        <vscode-button onclick="addSnippet()">Create<span slot="start" class="material-symbols-rounded">bookmark_add</span></vscode-button>
      </div>
      <div style="display: flex;flex-direction: column;">
        ${emptyPlaceholder || table}
      </div>
      </div>
    </body>
    </html>`;
  }
}
