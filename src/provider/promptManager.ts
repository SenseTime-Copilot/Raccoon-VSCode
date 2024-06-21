import { ExtensionContext, window, Uri, CustomReadonlyEditorProvider, CancellationToken, CustomDocument, CustomDocumentOpenContext, WebviewPanel, commands, Webview, Disposable, } from "vscode";
import { PromptInfo, PromptType, RaccoonPrompt } from "./promptTemplates";
import { promptEditorViewType, extensionNameKebab, raccoonManager, raccoonConfig } from "../globalEnv";
import { RaccoonManager } from "./raccoonManager";

export class PromptEditor implements CustomReadonlyEditorProvider, Disposable {
  static instance?: PromptEditor;
  private webview?: Webview;

  private constructor(private readonly context: ExtensionContext) {
    raccoonManager.onDidChangeStatus((e) => {
      if (this.webview && e.scope.includes("prompt")) {
        this.renderList(this.webview);
      }
    });
  }

  dispose() {
  }

  static register(context: ExtensionContext) {
    if (!PromptEditor.instance) {
      PromptEditor.instance = new PromptEditor(context);
      context.subscriptions.push(window.registerCustomEditorProvider(promptEditorViewType, PromptEditor.instance, {
        webviewOptions: {
          retainContextWhenHidden: true
        }
      }));
      context.subscriptions.push(PromptEditor.instance);
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
            "menu": `<button class="flex flex-row-reverse gap-2 items-center" ${p.shortcut ? `data-shortcut='/${p.shortcut}'` : ""}>
                      <span class="material-symbols-rounded">${icon}</span>
                      ${p.label}${p.inputRequired ? "..." : ""}
                      <span class="shortcut grow" style="color: var(--progress-background); text-shadow: 0 0 1px var(--progress-background);" data-suffix=${p.shortcut || ""}></span>
                    </button>`,
            "html": promptHtml.html
          });
          break;
        }
        case 'save': {
          raccoonManager.appendPrompt(msg.label, msg.shortcut, msg.prompt, msg.force).then(() => {
            if (label && label !== msg.label) {
              raccoonManager.removePromptItem(label);
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
    <style>
    textarea:invalid,
    vscode-text-field:invalid {
      --focus-border: var(--vscode-inputValidation-warningBorder);
    }
    </style>
    <script>
    document.oncontextmenu = () => {
      return false;
    };
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
        if (labelNode.value && /^[a-zA-Z]\\w{0,15}$/.test(shortcutNode.value) && prompt.value){
          saveNode.disabled = false;
        } else {
          saveNode.disabled = true;
        }
        updatePreview();
      });
      shortcutNode.addEventListener("input", (_e)=>{
        if (labelNode.value && /^[a-zA-Z]\\w{0,15}$/.test(shortcutNode.value) && prompt.value){
          saveNode.disabled = false;
        } else {
          saveNode.disabled = true;
        }
        updatePreview();
      });
      prompt.addEventListener("input", (_e)=>{
        if (labelNode.value && /^[a-zA-Z]\\w{0,15}$/.test(shortcutNode.value) && prompt.value){
          saveNode.disabled = false;
        } else {
          saveNode.disabled = true;
        }
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
      shortcutNode.focus();
    };
    </script>
    </head>
    <body>
    <div class="markdown-body" style="margin: 1rem 4rem;">
      <h2>${raccoonConfig.t("Custom Prompt")}</h2>
      <div style="display: flex; flex-direction: column;">
        <div style="display: flex; grid-gap: 1rem; flex-flow: wrap">
          <vscode-text-field id="shortcut" tabindex="1" required pattern="^[a-zA-Z]\\w{0,15}$" maxlength=16 placeholder="${raccoonConfig.t("Start with a letter, with a length limit of {{lengthLimit}} word characters", { lengthLimit: "1~16" })}" style="white-space: normal; flex-grow: 3; font-family: var(--vscode-editor-font-family);" ${shortcut && `value="${shortcut}"`}}>${raccoonConfig.t("Shortcut")}
            <vscode-link slot="start" tabindex="-1" style="cursor: help;" href="#" title="${raccoonConfig.t("Shortcut")}">
              <span class="material-symbols-rounded">pen_size_3</span>
            </vscode-link>
          </vscode-text-field>
          <vscode-text-field id="label" tabindex="2" required maxlength="16" placeholder="${raccoonConfig.t("Display label")}" style="white-space: normal; flex-grow: 3; font-family: var(--vscode-editor-font-family);" ${label && `value="${label}"`}>${raccoonConfig.t("Label")}
            <vscode-link slot="start" tabindex="-1" style="cursor: help;" href="#" title="${raccoonConfig.t("Display label")}">
              <span class="material-symbols-rounded">smart_button</span>
            </vscode-link>
          </vscode-text-field>
        </div>
        <div style="display: flex; grid-gap: 0 1rem; flex-flow: wrap">
          <div style="display: flex;flex-direction: column;min-width: 320px;flex-grow: 50;margin-top: 1rem;">
            <label for="prompt" style="display: block;line-height: normal;margin-bottom: 4px;font-family: var(--vscode-editor-font-family);">${raccoonConfig.t("Custom Prompt")}</label>
            <div class="flex gap-1 p-1" style="border-radius: 6px 6px 0 0;background-color: var(--input-background);border-bottom: 1px dashed var(--vscode-dropdown-border);height: 33px;z-index: 1;width: calc(100% - 2px);margin: 0 1px;">
              <span class="material-symbols-rounded opacity-50" style="padding: 4px 5px 0 2px;border-right: 1px solid var(--vscode-dropdown-border);">home_repair_service</span>
              <vscode-button appearance="icon" onclick="insert_code()" title="${raccoonConfig.t("Captured code from editor")}">
                <span class="material-symbols-rounded">data_object</span>
              </vscode-button>
              <vscode-button appearance="icon" onclick="insert_textfield()" title="${raccoonConfig.t("Text field")}">
                <span class="material-symbols-rounded">insert_text</span>
              </vscode-button>
              <vscode-button appearance="icon" onclick="insert_textfield('placeholder')" title="${raccoonConfig.t("Text field with placeholder")}">
                <span class="material-symbols-rounded">glyphs</span>
              </vscode-button>
            </div>
            <textarea tabindex="3" id="prompt" required rows="10" resize="vertical" style="border-radius: 6px;padding: 43px 9px 9px 9px;margin-top: -34px;outline-color: var(--vscode-focusBorder);font-family: var(--vscode-editor-font-family);height: 268px;border: 1px solid var(--vscode-dropdown-border);"></textarea>
          </div>
          <div style="display: flex;flex-direction: column;min-width: 480px;flex-grow: 1;margin-top: 1rem;">
            <label for="preview" style="display: block;line-height: normal;margin-bottom: 4px;font-family: var(--vscode-editor-font-family);">${raccoonConfig.t("Preview")}</label>
            <div id="ask-list" style="position: initial; border-bottom: none; padding: 0;"></div>
            <div id="preview" style="box-sizing: border-box;flex-grow: 1;padding: 1rem;border: 1px solid var(--dropdown-border);margin: 0 3px;border-radius: 6px; background-color: var(--panel-view-background);">
            </div>
          </div>
        </div>
        <div style="display: flex; margin-top: 1rem; align-self: flex-end; grid-gap: 1rem;">
          <vscode-button tabindex="5" appearance="secondary" onclick="cancel()" style="--button-padding-horizontal: 2rem;">${raccoonConfig.t("Cancel")}</vscode-button>
          <vscode-button tabindex="4" id="save" ${(shortcut && shortcut.length > 0) ? '' : 'disabled'} onclick="save('${label}')" style="--button-padding-horizontal: 2rem;">${raccoonConfig.t("Save")}</vscode-button>
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
        case 'show': {
          raccoonManager.setPromptVisibility(msg.label, true);
          break;
        }
        case 'hide': {
          raccoonManager.setPromptVisibility(msg.label, false);
          break;
        }
        case 'add': {
          commands.executeCommand("vscode.openWith", Uri.parse(`${extensionNameKebab}://raccoon.prompt/new.raccoon.prompt?${encodeURIComponent(JSON.stringify({ title: `${raccoonConfig.t("Custom Prompt")} [${raccoonConfig.t("New")}]` }))}`), promptEditorViewType);
          break;
        }
        case 'edit': {
          let prompt = raccoonManager.getPromptItem(msg.label);
          if (prompt) {
            let info = { label: prompt.label, shortcut: prompt.shortcut || "", origin: prompt.origin || prompt.message.content || "" };
            commands.executeCommand("vscode.openWith", Uri.parse(`${extensionNameKebab}://raccoon.prompt/edit.raccoon.prompt?${encodeURIComponent(JSON.stringify({ title: `${raccoonConfig.t("Custom Prompt")} [${prompt.label}]` }))}#${encodeURIComponent(JSON.stringify(info))}`), promptEditorViewType);
          }
          break;
        }
        case 'delete': {
          raccoonManager.removePromptItem(msg.label);
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
    <vscode-data-grid aria-label="Basic" generate-header="sticky" grid-template-columns="calc(20ch + 24px) 1fr 2fr 120px" style="--font-family: var(--vscode-editor-font-family); border-top: 1px solid; border-bottom: 1px solid; border-color: var(--dropdown-border); min-width: calc( 48ch + 380px);">
      <vscode-data-grid-row row-type="sticky-header">
      <vscode-data-grid-cell cell-type="columnheader" grid-column="1">${raccoonConfig.t("Shortcut")}</vscode-data-grid-cell>
      <vscode-data-grid-cell cell-type="columnheader" grid-column="2">${raccoonConfig.t("Label")}</vscode-data-grid-cell>
      <vscode-data-grid-cell cell-type="columnheader" grid-column="3">${raccoonConfig.t("Custom Prompt")}</vscode-data-grid-cell>
      <vscode-data-grid-cell cell-type="columnheader" grid-column="4" style="text-align: right;">${raccoonConfig.t("Action")}</vscode-data-grid-cell>
      </vscode-data-grid-row>
    `;
    let hiddenPrompts = this.context.globalState.get<string[]>(`${extensionNameKebab}.hiddenPrompts`) || [];
    for (let s of prompts) {
      let invisible = hiddenPrompts.includes(s.label);
      let actions = `<vscode-link ${invisible ? `style="display: none"` : ``}>
                      <span class="material-symbols-rounded hide-prompt" onclick="hidePrompt('${s.label}')" title="${raccoonConfig.t("Hide")}">visibility</span>
                    </vscode-link>
                    <vscode-link ${invisible ? `` : `style="display: none"`}>
                      <span class="material-symbols-rounded show-prompt" onclick="showPrompt('${s.label}')" title="${raccoonConfig.t("Show")}">visibility_off</span>
                    </vscode-link>`;
      if (s.type === PromptType.customPrompt) {
        actions = `<vscode-link>
                    <span class="material-symbols-rounded edit-prompt" onclick="editPrompt('${s.label}')" title="${raccoonConfig.t("Edit")}">edit</span>
                  </vscode-link>
                  <vscode-link>
                    <span class="material-symbols-rounded delete-prompt" onclick="deleteByShortcut('${s.label}')" title="${raccoonConfig.t("Delete")}">delete</span>
                  </vscode-link>` + actions;
      }

      emptyPlaceholder = '';
      table += `
      <vscode-data-grid-row id="${s.shortcut}" style="border-top: 1px solid; border-color: var(--dropdown-border);">
        <vscode-data-grid-cell grid-column="1" style="display: flex; align-self: center; ${invisible ? 'opacity: 0.6;' : ""}" title="/${s.shortcut}">${s.shortcut || '-'}</vscode-data-grid-cell>
        <vscode-data-grid-cell grid-column="2" style="display: flex; align-self: center; ${invisible ? 'opacity: 0.6;' : ""}" title="${s.label}" onclick="editPrompt('${s.label}')"><vscode-link>${s.label}</vscode-link></vscode-data-grid-cell>
        <vscode-data-grid-cell grid-column="3" style="display: flex; align-self: center; ${invisible ? 'opacity: 0.6;' : ""} overflow-x: auto; white-space: pre;">${s.origin?.replace(/</g, "&lt;") || ""}</vscode-data-grid-cell>
        <vscode-data-grid-cell grid-column="4" style="display: flex; align-self: center; justify-self: flex-end; column-gap: 0.25rem;">
          ${actions}
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
    document.oncontextmenu = () => {
      return false;
    };
    const vscode = acquireVsCodeApi();
    function showPrompt(label) {
      vscode.postMessage(
        {
          "type": "show",
          "label": label
        }
      )
    }
    function hidePrompt(label) {
      vscode.postMessage(
        {
          "type": "hide",
          "label": label
        }
      )
    }
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
      <h2>${raccoonConfig.t("Custom Prompt")} ${raccoonConfig.t("List")}</h2>
      <div style="display: flex; justify-content: flex-end; margin: 0.5rem;">
        <vscode-button onclick="addPrompt()">${raccoonConfig.t("Create")}<span slot="start" class="material-symbols-rounded">bookmark_add</span></vscode-button>
      </div>
      <div style="display: flex;flex-direction: column;">
        ${emptyPlaceholder || table}
      </div>
      </div>
    </body>
    </html>`;
  }
}
