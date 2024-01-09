import { ExtensionContext, window, Uri, workspace, CustomReadonlyEditorProvider, CancellationToken, CustomDocument, CustomDocumentOpenContext, WebviewPanel, commands, Webview, Disposable, l10n, } from "vscode";
import { PromptInfo, PromptType, RaccoonPrompt } from "./promptTemplates";
import { raccoonManager } from "../globalEnv";
import { RaccoonManager } from "./raccoonManager";

export class PromptEditor implements CustomReadonlyEditorProvider, Disposable {
  static readonly viweType: string = "raccoon.promptManager";
  static instance?: PromptEditor;
  private webview?: Webview;

  private constructor(private readonly context: ExtensionContext) {
    workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration("Raccoon.Prompt")) {
        if (this.webview) {
          this.renderList(this.webview);
        }
      }
    });
  }

  dispose() {
  }

  static register(context: ExtensionContext) {
    if (!PromptEditor.instance) {
      PromptEditor.instance = new PromptEditor(context);
      context.subscriptions.push(window.registerCustomEditorProvider(PromptEditor.viweType, PromptEditor.instance, {
        webviewOptions: {
          retainContextWhenHidden: true
        }
      }));
      context.subscriptions.push(PromptEditor.instance);
    }
  }

  private getPromptItems(label: string): RaccoonPrompt {
    let ps = raccoonManager.prompt;
    let t = ps.filter((p) => (p.label === label && p.type === PromptType.customPrompt));
    return t[0];
  }

  private async appendPrompt(label: string, shortcut: string, prompt: string, overwrite?: boolean): Promise<void> {
    let cfg = workspace.getConfiguration("Raccoon", undefined);
    let customPrompts: { [key: string]: string | any } = {};
    let writeable = true;
    if (cfg) {
      customPrompts = cfg.get("Prompt", {});
      if (!overwrite) {
        for (let labelName in customPrompts) {
          if (typeof customPrompts[labelName] === 'object') {
            if (labelName === label) {
              writeable = false;
            }
          }
        }
      }
    }
    if (!writeable) {
      await window.showWarningMessage(l10n.t("The prompt already exists, overwrite it?"), l10n.t("Cancel"), l10n.t("Overwrite")).then(res => {
        if (res === l10n.t("Overwrite")) {
          writeable = true;
        }
      }, () => { });
    }
    if (!writeable) {
      return Promise.reject();
    }
    let p = RaccoonManager.parseStringPrompt(label, prompt, shortcut);
    let savep: any = { shortcut: p.shortcut, origin: prompt, prompt: p.message.content, args: p.args };
    return cfg.update("Prompt", { ...customPrompts, [label]: savep }, true);
  }

  private async removePromptItem(label: string) {
    let cfg = workspace.getConfiguration("Raccoon", undefined);
    let customPrompts: { [key: string]: string | any } = {};
    if (cfg) {
      customPrompts = cfg.get("Prompt", {});
      for (let labelName in customPrompts) {
        if (labelName === label) {
          customPrompts[labelName] = undefined;
          cfg.update("Prompt", customPrompts, true);
          return;
        }
      }
    }
  }

  openCustomDocument(uri: Uri, _openContext: CustomDocumentOpenContext, _token: CancellationToken): CustomDocument {
    if (uri.path === "/all.raccoon.prompt") {
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
    if (document.uri.path === "/all.raccoon.prompt") {
      this.webview = webviewPanel.webview;
      return this.promptListPage(webviewPanel);
    } else if (document.uri.path === "/new.raccoon.prompt") {
      return this.promptEditorPage(webviewPanel);
    } else {
      let msg = JSON.parse(document.uri.fragment);
      this.promptEditorPage(webviewPanel, msg.label, msg.shortcut, msg.origin);
    }
  }

  async promptEditorPage(panel: WebviewPanel, label?: string, shortcut?: string, prompt?: string) {
    let webview = panel.webview;
    webview.options = {
      enableScripts: true
    };
    webview.onDidReceiveMessage((msg) => {
      switch (msg.type) {
        case 'preview': {
          let icon = "smart_button";
          let p = RaccoonManager.parseStringPrompt(msg.label, msg.prompt, msg.shortcut);
          p.code =
            "Set moveCount to 1\n" +
            "FOR each row on the board\n" +
            "    FOR each column on the board\n" +
            "        IF gameBoard position (row, column) is occupied THEN\n" +
            "            CALL findAdjacentTiles with row, column\n" +
            "            INCREMENT moveCount\n" +
            "        END IF\n" +
            "    END FOR\n" +
            "END FOR\n";
          p.languageid = "pseudo";
          let pi: PromptInfo = new PromptInfo(p);
          let promptHtml = pi.generatePromptHtml(0);
          webview.postMessage({
            "type": "preview",
            "menu": `<button class="flex gap-2 items-center" ${p.shortcut ? `data-shortcut='/${p.shortcut}'` : ""}>
                      <span class="material-symbols-rounded">${icon}</span>
                      ${p.label}${p.inputRequired ? "..." : ""}
                      <span class="shortcut grow text-right" style="color: var(--progress-background); text-shadow: 0 0 1px var(--progress-background);" data-suffix=${p.shortcut || ""}></span>
                    </button>`,
            "html": promptHtml.html
          });
          break;
        }
        case 'save': {
          this.appendPrompt(msg.label, msg.shortcut, msg.prompt, msg.force).then(() => {
            if (label && label !== msg.label) {
              this.removePromptItem(label);
            }
            panel.dispose();
          }, () => { });
          break;
        }
        case 'cancel': {
          panel.dispose();
          break;
        }
      }
    });

    const toolkitUri = webview.asWebviewUri(Uri.joinPath(this.context.extensionUri, "media", "toolkit.js"));
    const mainCSS = webview.asWebviewUri(Uri.joinPath(this.context.extensionUri, 'media', 'main.css'));
    const vendorTailwindJs = webview.asWebviewUri(Uri.joinPath(this.context.extensionUri, 'media', 'vendor', 'tailwindcss.3.2.4.min.js'));
    const iconUri = webview.asWebviewUri(Uri.joinPath(this.context.extensionUri, 'media', 'MaterialSymbols', 'materialSymbols.css'));

    webview.html = `
    <html>
    <head>
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; font-src ${webview.cspSource};  style-src ${webview.cspSource} 'unsafe-inline'; script-src ${webview.cspSource} 'unsafe-inline';" >
    <script type="module" src="${toolkitUri}"></script>
    <script src="${vendorTailwindJs}"></script>
    <link href="${iconUri}" rel="stylesheet" />
    <link href="${mainCSS}" rel="stylesheet" />
    <script>
    const vscode = acquireVsCodeApi();
    function save(old) {
      var label = document.getElementById("label").value;
      var shortcut = document.getElementById("shortcut").value;
      var prompt = document.getElementById("prompt").value;
      vscode.postMessage(
        {
          "type": "save",
          "force": label === old,
          "label": label,
          "shortcut": shortcut,
          "prompt": prompt
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
    function updatePreview() {
      var promptNode = document.getElementById("prompt");
      var labelNode = document.getElementById("label");
      var shortcutNode = document.getElementById("shortcut");
      vscode.postMessage(
        {
          "type": "preview",
          "label": labelNode.value,
          "prompt": promptNode.value,
          "shortcut": shortcutNode.value
        }
      )
    }
    function insert_code() {
      var promptNode = document.getElementById("prompt");
      var posStart = promptNode.selectionStart;
      var posEnd = promptNode.selectionEnd;
      var prefix = promptNode.value.slice(0, posStart);
      var suffix = promptNode.value.slice(posEnd);
      promptNode.value = prefix + "{{code}}" + suffix;
      promptNode.selectionStart = posStart;
      promptNode.selectionEnd = posStart + 8;
      updatePreview();
      promptNode.focus();
    }
    function insert_textfield(placeholder) {
      var promptNode = document.getElementById("prompt");
      var posStart = promptNode.selectionStart;
      var posEnd = promptNode.selectionEnd;
      var prefix = promptNode.value.slice(0, posStart);
      var suffix = promptNode.value.slice(posEnd);
      if (!placeholder) {
        promptNode.value = prefix + "{{input}}" + suffix;
        promptNode.selectionStart = posStart;
        promptNode.selectionEnd = posStart + 9;
      } else {
        promptNode.value = prefix + "{{input:" + placeholder + "}}" + suffix;
        promptNode.selectionStart = posStart + 8;
        promptNode.selectionEnd = posStart + 8 + 11;
      }
      updatePreview();
      promptNode.focus();
    }
    window.onload = (event) => {
      var prompt = document.getElementById("prompt");
      prompt.value = ${JSON.stringify(prompt || "")};
      var labelNode = document.getElementById("label");
      var shortcutNode = document.getElementById("shortcut");
      var saveNode = document.getElementById("save");
      labelNode.addEventListener("input", (_e)=>{
        if (labelNode.value && /^[a-zA-Z]\\w{0,15}$/.test(shortcutNode.value)){
          saveNode.disabled = false;
        } else {
          saveNode.disabled = true;
        }
        updatePreview();
      });
      shortcutNode.addEventListener("input", (_e)=>{
        if (labelNode.value && /^[a-zA-Z]\\w{0,15}$/.test(shortcutNode.value)){
          saveNode.disabled = false;
        } else {
          saveNode.disabled = true;
        }
        updatePreview();
      });
      prompt.addEventListener("input", (_e)=>{
        updatePreview();
      });
      window.addEventListener("message", (event) => {
        const message = event.data;
        switch (message.type) {
          case 'preview': {
            var menuNode = document.getElementById("ask-list");
            menuNode.innerHTML = message.menu;
            var previewNode = document.getElementById("preview");
            previewNode.innerHTML = message.html;
            break;
          }
        }
      });
      updatePreview();
      labelNode.focus();
    };
    </script>
    </head>
    <body>
    <div class="markdown-body" style="margin: 1rem 4rem;">
      <h2>${l10n.t("Custom Prompt")}</h2>
      <div style="display: flex; flex-direction: column;">
        <div style="display: flex; grid-gap: 1rem; flex-flow: wrap">
          <vscode-text-field id="label" tabindex="1" placeholder="${l10n.t("Display label")}" style="white-space: normal; flex-grow: 3; font-family: var(--vscode-editor-font-family);" maxlength="16" ${label && `value="${label}"`}>${l10n.t("Label")}
            <vscode-link slot="end" tabindex="-1" style="cursor: help;" href="#" title="${l10n.t("Display label")}">
              <span class="material-symbols-rounded">text_fields</span>
            </vscode-link>
          </vscode-text-field>
          <vscode-text-field id="shortcut" tabindex="2" placeholder="${l10n.t("Start with a letter, with a length limit of {0} characters", "1~16")}" style="white-space: normal; flex-grow: 3; font-family: var(--vscode-editor-font-family);" maxlength="16" ${shortcut && `value="${shortcut}"`}}>${l10n.t("Shortcut")}
            <vscode-link slot="end" tabindex="-1" style="cursor: help;" href="#" title="/^[a-zA-Z]\\w{0,15}$/">
              <span class="material-symbols-rounded">regular_expression</span>
            </vscode-link>
          </vscode-text-field>
        </div>
        <div style="display: flex; grid-gap: 0 1rem; flex-flow: wrap">
          <div style="display: flex;flex-direction: column;min-width: 320px;flex-grow: 50;margin-top: 1rem;">
            <label for="prompt" style="display: block;line-height: normal;margin-bottom: 4px;font-family: var(--vscode-editor-font-family);">${l10n.t("Custom Prompt")}</label>
            <div class="flex gap-1 p-1" style="border-radius: 6px 6px 0 0;background-color: var(--input-background);border-bottom: 1px dashed var(--panel-view-border);height: 33px;z-index: 1;width: calc(100% - 2px);margin: 0 1px;">
              <span class="material-symbols-rounded" style="padding: 4px 5px 0 2px;border-right: 1px solid var(--panel-view-border);">home_repair_service</span>
              <vscode-button appearance="icon" onclick="insert_code()" title="${l10n.t("Captured code from editor")}">
                <span class="material-symbols-rounded">data_object</span>
              </vscode-button>
              <vscode-button appearance="icon" onclick="insert_textfield()" title="${l10n.t("Text field")}">
                <span class="material-symbols-rounded">insert_text</span>
              </vscode-button>
              <vscode-button appearance="icon" onclick="insert_textfield('placeholder')" title="${l10n.t("Text field with placeholder")}">
                <span class="material-symbols-rounded">glyphs</span>
              </vscode-button>
            </div>
            <textarea tabindex="3" id="prompt" rows="10" resize="vertical" style="border-radius: 6px;padding: 43px 9px 9px 9px;margin-top: -34px;outline-color: var(--vscode-focusBorder);font-family: var(--vscode-editor-font-family);height: 268px;">
            </textarea>
          </div>
          <div style="display: flex;flex-direction: column;min-width: 480px;flex-grow: 1;margin-top: 1rem;">
            <label for="preview" style="display: block;line-height: normal;margin-bottom: 4px;font-family: var(--vscode-editor-font-family);">${l10n.t("Preview")}</label>
            <div id="ask-list" style="position: initial; border-bottom: none; padding: 0;"></div>
            <div id="preview" style="box-sizing: border-box;flex-grow: 1;padding: 1rem;border: 1px solid var(--dropdown-border);border-radius: 0 0 6px 6px; background-color: var(--panel-view-background);">
            </div>
          </div>
        </div>
        <div style="display: flex; margin-top: 1rem; align-self: flex-end; grid-gap: 1rem;">
          <vscode-button tabindex="5" appearance="secondary" onclick="cancel()" style="--button-padding-horizontal: 2rem;">${l10n.t("Cancel")}</vscode-button>
          <vscode-button tabindex="4" id="save" ${(shortcut && shortcut.length > 0) ? '' : 'disabled'} onclick="save('${label}')" style="--button-padding-horizontal: 2rem;">${l10n.t("Save")}</vscode-button>
        </div>
      </div>
      </div>
    </body>
    </html>`;
  }

  private async promptListPage(panel: WebviewPanel) {
    let webview = panel.webview;
    webview.options = {
      enableScripts: true
    };
    webview.onDidReceiveMessage((msg) => {
      switch (msg.type) {
        case 'add': {
          commands.executeCommand("vscode.openWith", Uri.parse(`raccoon://raccoon.prompt/new.raccoon.prompt?${encodeURIComponent(JSON.stringify({ title: `${l10n.t("Custom Prompt")} [${l10n.t("New")}]` }))}`), PromptEditor.viweType);
          break;
        }
        case 'edit': {
          let prompt = this.getPromptItems(msg.label);
          if (prompt) {
            let info = { label: prompt.label, shortcut: prompt.shortcut || "", origin: prompt.origin || prompt.message.content || "" };
            commands.executeCommand("vscode.openWith", Uri.parse(`raccoon://raccoon.prompt/edit.raccoon.prompt?${encodeURIComponent(JSON.stringify({ title: `${l10n.t("Custom Prompt")} [${prompt.label}]` }))}#${encodeURIComponent(JSON.stringify(info))}`), PromptEditor.viweType);
          }
          break;
        }
        case 'delete': {
          this.removePromptItem(msg.label);
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

    let prompts: RaccoonPrompt[] = raccoonManager.prompt;

    let emptyPlaceholder = `
    <div style="text-align: center;margin: 10% 0; opacity: 0.3; user-select: none;">
      <span class="material-symbols-rounded" style="font-size: 4rem; font-variation-settings: 'FILL' 0, 'wght' 300, 'GRAD' 0, 'opsz' 48;">folder_open</span>
      <div style="font-family: var(--vscode-editor-font-family);">No Custom Prompt</div>
    </div>`;
    let table = `
    <vscode-data-grid aria-label="Basic" generate-header="sticky" grid-template-columns="1fr 2fr calc(20ch + 24px) 84px" style="--font-family: var(--vscode-editor-font-family); border-top: 1px solid; border-bottom: 1px solid; border-color: var(--dropdown-border); min-width: calc( 48ch + 380px);">
      <vscode-data-grid-row row-type="sticky-header">
      <vscode-data-grid-cell cell-type="columnheader" grid-column="1">${l10n.t("Label")}</vscode-data-grid-cell>
      <vscode-data-grid-cell cell-type="columnheader" grid-column="2">${l10n.t("Custom Prompt")}</vscode-data-grid-cell>
      <vscode-data-grid-cell cell-type="columnheader" grid-column="3">${l10n.t("Shortcut")}</vscode-data-grid-cell>
      <vscode-data-grid-cell cell-type="columnheader" grid-column="4">${l10n.t("Action")}</vscode-data-grid-cell>
      </vscode-data-grid-row>
    `;
    for (let s of prompts) {
      if (s.type !== PromptType.customPrompt) {
        continue;
      }
      emptyPlaceholder = '';
      table += `
      <vscode-data-grid-row id="${s.shortcut}" style="border-top: 1px solid; border-color: var(--dropdown-border);">
        <vscode-data-grid-cell grid-column="1" style="align-self: center;" title="${s.label}">${s.label}</vscode-data-grid-cell>
        <vscode-data-grid-cell grid-column="2" style="align-self: center; overflow-x: auto; white-space: pre;">${s.origin?.replace(/</g, "&lt;") || ""}</vscode-data-grid-cell>
        <vscode-data-grid-cell grid-column="3" style="align-self: center;" title="/${s.shortcut}">${s.shortcut || '-'}</vscode-data-grid-cell>
        <vscode-data-grid-cell grid-column="4" style="align-self: center;">
          <vscode-link>
            <span class="material-symbols-rounded edit-prompt" onclick="editPrompt('${s.label}')">edit</span>
          </vscode-link>
          <vscode-link>
            <span class="material-symbols-rounded delete-prompt" onclick="deleteByShortcut('${s.label}')">delete</span>
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
    function addPrompt() {
      vscode.postMessage(
        {
          "type": "add"
        }
      )
    }
    function editPrompt(label) {
      vscode.postMessage(
        {
          "type": "edit",
          "label": label
        }
      )
    }
    function deleteByShortcut(label) {
      vscode.postMessage(
        {
          "type": "delete",
          "label": label
        }
      )
    }
    </script>
    </head>
    <body>
    <div class="markdown-body" style="margin: 1rem 4rem;">
      <h2>${l10n.t("Custom Prompt")} ${l10n.t("List")}</h2>
      <div style="display: flex; justify-content: flex-end; margin: 0.5rem;">
        <vscode-button onclick="addPrompt()">${l10n.t("Create")}<span slot="start" class="material-symbols-rounded">bookmark_add</span></vscode-button>
      </div>
      <div style="display: flex;flex-direction: column;">
        ${emptyPlaceholder || table}
      </div>
      </div>
    </body>
    </html>`;
  }
}
