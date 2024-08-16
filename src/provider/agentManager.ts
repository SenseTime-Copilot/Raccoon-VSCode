import { ExtensionContext, window, Uri, CustomReadonlyEditorProvider, CancellationToken, CustomDocument, CustomDocumentOpenContext, WebviewPanel, commands, Webview, Disposable } from "vscode";
import { agentEditorViewType, extensionNameKebab, raccoonConfig, raccoonManager } from "../globalEnv";
import { Tool } from "../raccoonClient/CodeClient";

export interface AgentTool {
  type: "knowledges" | "webSearch" | "openedFiles" | "document" | "workspaceTree";
  tools: Tool[];
}

export interface RaccoonAgent {
  id: string;
  label: string;
  icon: string;
  contextInformation: "none" | "last" | "all";
  agentTools: AgentTool[];
  systemPrompt: string;
  builtin?: boolean;
}

export class AgentEditor implements CustomReadonlyEditorProvider, Disposable {
  static instance?: AgentEditor;
  private webview?: Webview;

  private constructor(private readonly context: ExtensionContext) {
    raccoonManager.onDidChangeStatus((e) => {
      if (this.webview && e.scope.includes("agent")) {
        this.renderList(this.webview);
      }
    });
  }

  dispose() {
  }

  static register(context: ExtensionContext) {
    if (!AgentEditor.instance) {
      AgentEditor.instance = new AgentEditor(context);
      context.subscriptions.push(window.registerCustomEditorProvider(agentEditorViewType, AgentEditor.instance, {
        webviewOptions: {
          retainContextWhenHidden: true
        }
      }));
      context.subscriptions.push(AgentEditor.instance);
    }
  }

  openCustomDocument(uri: Uri, _openContext: CustomDocumentOpenContext, _token: CancellationToken): CustomDocument {
    if (uri.path === "/all.raccoon.agent") {
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
    if (document.uri.path === "/all.raccoon.agent") {
      this.webview = webviewPanel.webview;
      return this.agentListPage(webviewPanel);
    } else if (document.uri.path === "/new.raccoon.agent") {
      return this.agentEditorPage(webviewPanel);
    } else {
      let agent = JSON.parse(document.uri.fragment);
      this.agentEditorPage(webviewPanel, agent);
    }
  }

  async agentEditorPage(panel: WebviewPanel, agent?: RaccoonAgent) {
    let webview = panel.webview;
    webview.options = {
      enableScripts: true
    };
    webview.onDidReceiveMessage((msg) => {
      switch (msg.type) {
        case 'save': {
          raccoonManager.appendAgent(msg.agent, msg.force).then(() => {
            if (agent && agent.id !== msg.agent.id) {
              raccoonManager.removeAgent(agent.id);
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
    document.oncontextmenu = () => {
      return false;
    };
    const vscode = acquireVsCodeApi();
    function save(old) {
      var label = document.getElementById("label").value;
      var shortcut = document.getElementById("shortcut").value;
      var prompt = document.getElementById("prompt").value;
      var context = document.getElementById("context").value;
      vscode.postMessage(
        {
          "type": "save",
          "force": shortcut === old,
          "agent": {
            "id": shortcut,
            "label": label,
            "icon": "person",
            "contextInformation": context,
            "systemPrompt": prompt,
            "knowledges": []
          }
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
      var prompt = document.getElementById("prompt");
      prompt.value = "${agent?.systemPrompt || ""}";
      var labelNode = document.getElementById("label");
      var shortcutNode = document.getElementById("shortcut");
      var saveNode = document.getElementById("save");
      labelNode.addEventListener("input", (_e)=>{
        if (labelNode.value && shortcutNode.value && prompt.value) {
          saveNode.disabled = false;
        } else {
          saveNode.disabled = true;
        }
      });
      shortcutNode.addEventListener("input", (_e)=>{
        if (labelNode.value && shortcutNode.value && prompt.value) {
          saveNode.disabled = false;
        } else {
          saveNode.disabled = true;
        }
      });
      prompt.addEventListener("input", (_e)=>{
        if (labelNode.value && shortcutNode.value && prompt.value) {
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
      <h2>${raccoonConfig.t("Custom Agent")}</h2>
      <div style="display: flex; flex-direction: column;">
        <div style="display: flex; grid-gap: 1rem; flex-flow: wrap">
          <vscode-text-field ${agent?.builtin ? "readonly" : ""} id="shortcut" tabindex="1" placeholder="${raccoonConfig.t("Start with a letter, with a length limit of {{lengthLimit}} word characters", { lengthLimit: "1~16" })}" style="white-space: normal; flex-grow: 3; font-family: var(--vscode-editor-font-family);" maxlength="16" ${agent && `value="${agent.id}"`}>${raccoonConfig.t("ID")}
            <vscode-link slot="start" tabindex="-1" style="cursor: help;" href="#" title="${raccoonConfig.t("ID")}">
              <span class="material-symbols-rounded">alternate_email</span>
            </vscode-link>
          </vscode-text-field>
          <vscode-text-field ${agent?.builtin ? "readonly" : ""} id="label" tabindex="2" placeholder="${raccoonConfig.t("Display label")}" style="white-space: normal; flex-grow: 3; font-family: var(--vscode-editor-font-family);" maxlength="16" ${agent && `value="${agent.label}"`}>${raccoonConfig.t("Label")}
            <vscode-link slot="start" tabindex="-1" style="cursor: help;" href="#" title="${raccoonConfig.t("Display label")}">
              <span class="material-symbols-rounded">smart_button</span>
            </vscode-link>
          </vscode-text-field>
        </div>
        <div style="display: flex; grid-gap: 0 1rem; flex-flow: wrap">
          <div style="display: flex;flex-direction: column;min-width: 320px;flex-grow: 50;margin-top: 1rem;">
            <label for="prompt" style="display: block;line-height: normal;margin-bottom: 4px;font-family: var(--vscode-editor-font-family);">${raccoonConfig.t("System Prompt")}</label>
            <textarea ${agent?.builtin ? "readonly" : ""} tabindex="3" id="prompt" rows="10" resize="vertical" style="border-radius: 6px;padding: 9px 9px 9px 9px;outline-color: var(--vscode-focusBorder);font-family: var(--vscode-editor-font-family);height: 268px;border: 1px solid var(--vscode-dropdown-border);"></textarea>
          </div>
        </div>
        <div style="display: flex; grid-gap: 0 1rem; flex-flow: wrap">
          <div style="display: flex;flex-direction: column;min-width: 320px;flex-grow: 50;margin-top: 1rem;">
            <label for="RAG" style="display: block;line-height: normal;margin-bottom: 4px;font-family: var(--vscode-editor-font-family);">${raccoonConfig.t("Context Information")}</label>
            <vscode-radio-group ${agent?.builtin ? "readonly" : ""} id="context" style="display: flex; margin-left: 1rem; grid-gap: 0 1rem; flex-flow: wrap" value="${agent?.contextInformation || "none"}">
              <vscode-radio style="--font-family: var(--vscode-editor-font-family);" value="none">${raccoonConfig.t("None")}</vscode-radio>
              <vscode-radio style="--font-family: var(--vscode-editor-font-family);" value="last">${raccoonConfig.t("Last Conversation")}</vscode-radio>
              <vscode-radio style="--font-family: var(--vscode-editor-font-family);" value="all">${raccoonConfig.t("Previous Conversations")}</vscode-radio>
            </vscode-radio-group>
          </div>
        </div>
        <div style="display: flex; grid-gap: 0 1rem; flex-flow: wrap;">
          <div style="display: flex;flex-direction: column;min-width: 320px;flex-grow: 50;margin-top: 1rem;">
            <label for="RAG" style="display: block;line-height: normal;margin-bottom: 4px;font-family: var(--vscode-editor-font-family);">${raccoonConfig.t("Tool Use")}</label>
            <div style="display: flex; margin-left: 1rem; grid-gap: 0 1rem; flex-flow: wrap">
              <vscode-checkbox ${agent?.builtin ? "readonly" : "disabled"} style="--font-family: var(--vscode-editor-font-family);">${raccoonConfig.t("Knowledge Base")}</vscode-checkbox>
              <vscode-checkbox ${agent?.builtin ? "readonly" : "disabled"} style="--font-family: var(--vscode-editor-font-family);">${raccoonConfig.t("Internet")}</vscode-checkbox>
            </div>
          </div>
        </div>
        <div style="display: flex; margin-top: 1rem; align-self: flex-end; grid-gap: 1rem;">
          <vscode-button tabindex="5" appearance="secondary" onclick="cancel()" style="--button-padding-horizontal: 2rem;">${raccoonConfig.t("Cancel")}</vscode-button>
          <vscode-button ${agent?.builtin ? "disabled" : ""} tabindex="4" id="save" ${(agent && agent.id.length > 0) ? '' : 'disabled'} onclick="save('${agent?.id}')" style="--button-padding-horizontal: 2rem;">${raccoonConfig.t("Save")}</vscode-button>
        </div>
      </div>
      </div>
    </body>
    </html>`;
  }

  private async agentListPage(panel: WebviewPanel) {
    let webview = panel.webview;
    webview.options = {
      enableScripts: true
    };
    webview.onDidReceiveMessage((msg) => {
      switch (msg.type) {
        case 'show': {
          raccoonManager.setAgentVisibility(msg.id, true);
          break;
        }
        case 'hide': {
          raccoonManager.setAgentVisibility(msg.id, false);
          break;
        }
        case 'add': {
          commands.executeCommand("vscode.openWith", Uri.parse(`${extensionNameKebab}://raccoon.agent/new.raccoon.agent?${encodeURIComponent(JSON.stringify({ title: `${raccoonConfig.t("Custom Agent")} [${raccoonConfig.t("New")}]` }))}`), agentEditorViewType);
          break;
        }
        case 'edit': {
          let agent = raccoonManager.agents.get(msg.id);
          if (agent) {
            commands.executeCommand("vscode.openWith", Uri.parse(`${extensionNameKebab}://raccoon.agent/edit.raccoon.agent?${encodeURIComponent(JSON.stringify({ title: `${raccoonConfig.t("Custom Agent")} [${agent.id}]` }))}#${encodeURIComponent(JSON.stringify(agent))}`), agentEditorViewType);
          }
          break;
        }
        case 'delete': {
          raccoonManager.removeAgent(msg.id);
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

    let agents: Map<string, RaccoonAgent> = raccoonManager.agents;

    let emptyPlaceholder = `
    <div style="text-align: center;margin: 10% 0; opacity: 0.3; user-select: none;">
      <span class="material-symbols-rounded" style="font-size: 4rem; font-variation-settings: 'FILL' 0, 'wght' 300, 'GRAD' 0, 'opsz' 48;">folder_open</span>
      <div style="font-family: var(--vscode-editor-font-family);">No Custom Agent</div>
    </div>`;
    let table = `
    <vscode-data-grid aria-label="Basic" generate-header="sticky" grid-template-columns="calc(20ch + 24px) 1fr 2fr 120px" style="--font-family: var(--vscode-editor-font-family); border-top: 1px solid; border-bottom: 1px solid; border-color: var(--dropdown-border); min-width: calc( 48ch + 380px);">
      <vscode-data-grid-row row-type="sticky-header">
      <vscode-data-grid-cell cell-type="columnheader" grid-column="1">${raccoonConfig.t("ID")}</vscode-data-grid-cell>
      <vscode-data-grid-cell cell-type="columnheader" grid-column="2">${raccoonConfig.t("Label")}</vscode-data-grid-cell>
      <vscode-data-grid-cell cell-type="columnheader" grid-column="3">${raccoonConfig.t("System Prompt")}</vscode-data-grid-cell>
      <vscode-data-grid-cell cell-type="columnheader" grid-column="4" style="text-align: right;">${raccoonConfig.t("Action")}</vscode-data-grid-cell>
      </vscode-data-grid-row>
    `;
    let hiddenAgents = this.context.globalState.get<string[]>(`${extensionNameKebab}.hiddenAgents`) || [];
    agents.forEach((s, _id, _m) => {
      let invisible = hiddenAgents.includes(s.id);
      let actions = `<vscode-link ${invisible ? `style="display: none"` : ``}>
                      <span class="material-symbols-rounded hide-agent" onclick="hideAgent('${s.id}')" title="${raccoonConfig.t("Hide")}">visibility</span>
                    </vscode-link>
                    <vscode-link ${invisible ? `` : `style="display: none"`}>
                      <span class="material-symbols-rounded show-agent" onclick="showAgent('${s.id}')" title="${raccoonConfig.t("Show")}">visibility_off</span>
                    </vscode-link>`;
      if (!s.builtin) {
        actions = `<vscode-link>
                    <span class="material-symbols-rounded edit-agent" onclick="editAgent('${s.id}')" title="${raccoonConfig.t("Edit")}">edit</span>
                  </vscode-link>
                  <vscode-link>
                    <span class="material-symbols-rounded delete-agent" onclick="deleteById('${s.id}')" title="${raccoonConfig.t("Delete")}">delete</span>
                  </vscode-link>` + actions;
      }
      emptyPlaceholder = '';
      table += `
      <vscode-data-grid-row id="${s.id}" style="border-top: 1px solid; border-color: var(--dropdown-border);">
        <vscode-data-grid-cell grid-column="1" style="display: flex; align-self: center; ${invisible ? 'opacity: 0.6;' : ""}" title="@${s.id}"><vscode-link onclick="editAgent('${s.id}')">${s.id}</vscode-link></vscode-data-grid-cell>
        <vscode-data-grid-cell grid-column="2" style="display: flex; align-self: center; ${invisible ? 'opacity: 0.6;' : ""}" title="${s.label}">${s.label}</vscode-data-grid-cell>
        <vscode-data-grid-cell grid-column="3" style="align-self: center; ${invisible ? 'opacity: 0.6;' : ""} overflow: hidden; white-space: nowrap; text-overflow: ellipsis;">${s.systemPrompt?.replace(/</g, "&lt;") || ""}</vscode-data-grid-cell>
        <vscode-data-grid-cell grid-column="4" style="display: flex; align-self: center; justify-self: flex-end; column-gap: 0.25rem;">
          ${actions}
        </vscode-data-grid-cell>
      </vscode-data-grid-row>
      `;
    });
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
    function showAgent(id) {
      vscode.postMessage(
        {
          "type": "show",
          "id": id
        }
      )
    }
    function hideAgent(id) {
      vscode.postMessage(
        {
          "type": "hide",
          "id": id
        }
      )
    }
    function addAgent() {
      vscode.postMessage(
        {
          "type": "add"
        }
      )
    }
    function editAgent(id) {
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
      <h2>${raccoonConfig.t("Custom Agent")} ${raccoonConfig.t("List")}</h2>
      <div style="display: flex; justify-content: flex-end; margin: 0.5rem;">
        <vscode-button onclick="addAgent()">${raccoonConfig.t("Create")}<span slot="start" class="material-symbols-rounded">bookmark_add</span></vscode-button>
      </div>
      <div style="display: flex;flex-direction: column;">
        ${emptyPlaceholder || table}
      </div>
      </div>
    </body>
    </html>`;
  }
}