import { ExtensionContext, languages, TextDocument, Position, MarkdownString, CompletionItem, CompletionItemKind, window, Uri, workspace, CustomReadonlyEditorProvider, CancellationToken, CustomDocument, CustomDocumentOpenContext, WebviewPanel, commands, RelativePattern, FileSystemWatcher, Webview, Disposable, CompletionList, } from "vscode";
import { getDocumentLanguage } from "../utils/getDocumentLanguage";

const encoder = new TextEncoder();
const decoder = new TextDecoder();

interface SnippetItem {
  id: string;
  languageid: string;
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
      snippet.languageid,
      {
        provideCompletionItems(document: TextDocument, position: Position) {
          const linePrefix = document.lineAt(position).text.slice(0, position.character);
          if (!snippet.shortcut || !linePrefix.endsWith(snippet.shortcut)) {
            return undefined;
          }

          let doc = new MarkdownString(`\`\`\`${snippet.languageid}\n${snippet.code}\n\`\`\`\n $(sensecode-icon) _from SenseCode favorite code snippets_`, true);

          let item = new CompletionItem(snippet.shortcut, CompletionItemKind.Snippet);
          item.insertText = snippet.code;
          item.documentation = doc;

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

  private async init(): Promise<void> {
    let snippetDir = Uri.joinPath(this.context.globalStorageUri, 'snippets');
    let snippetUri = Uri.joinPath(snippetDir, this.cacheFile);
    return workspace.fs.stat(snippetUri)
      .then(() => {
        return workspace.fs.stat(snippetUri)
          .then(() => {
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

  async deleteSnippetFiles(): Promise<void> {
    let snippetsDir = Uri.joinPath(this.context.globalStorageUri, 'snippets');
    return workspace.fs.stat(snippetsDir)
      .then(() => {
        workspace.fs.delete(snippetsDir, { recursive: true });
      });
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
          let id = snippet.id;
          let languageid = snippet.languageid;
          this.appendSnippetItem({ id, languageid, shortcut: msg.shortcut, code: msg.code });
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
      <div style="display: flex;flex-direction: column;">
        <div class="prompt" style="display: flex; grid-gap: 1rem;">
          <vscode-text-field tabindex="1" placeholder="Start with a letter, with a length limit of 4-16 characters" style="flex-grow: 3; font-family: var(--vscode-editor-font-family);" id="shortcut" maxlength="16" ${shortcut && `value="${shortcut}"`}}>Shortcut</vscode-text-field>
          <vscode-text-field style="flex-grow: 1; font-family: var(--vscode-editor-font-family);" disabled value="${getDocumentLanguage(snippet.languageid)}">Programming Language</vscode-text-field>
        </div>
        <vscode-text-area tabindex="2" id="codesnippet" rows="20" resize="vertical" style="margin: 1rem 0; font-family: var(--vscode-editor-font-family);">
        Snippet
        </vscode-text-area>
        <div style="display: flex; align-self: flex-end; grid-gap: 1rem;">
          <vscode-button tabindex="4" appearance="secondary" onclick="cancel()" style="--button-padding-horizontal: 2rem;">Cancel</vscode-button>
          <vscode-button tabindex="3" id="save" ${(shortcut && shortcut.length >= 4) ? '' : 'disabled'} onclick="save()" style="--button-padding-horizontal: 2rem;">Save</vscode-button>
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
      let s = snippets[id];
      table += `
      <vscode-data-grid-row id="${s.id}" style="border-top: 1px solid; border-color: var(--dropdown-border);">
        <vscode-data-grid-cell grid-column="1" style="align-self: center;">${s.id}</vscode-data-grid-cell>
        <vscode-data-grid-cell grid-column="2" style="align-self: center;">${getDocumentLanguage(s.languageid)}</vscode-data-grid-cell>
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
      <div style="display: flex;flex-direction: column;">
        ${table}
      </div>
      </div>
    </body>
    </html>`;
  }
}
