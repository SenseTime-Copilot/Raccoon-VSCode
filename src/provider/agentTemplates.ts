import { ExtensionContext, window, Uri, workspace, CustomReadonlyEditorProvider, CancellationToken, CustomDocument, CustomDocumentOpenContext, WebviewPanel, commands, Webview, Disposable, l10n, } from "vscode";
import { agentEditorViewType, extensionNameCamel, extensionNameKebab, raccoonManager } from "../globalEnv";
import { KnowledgeBase } from "../raccoonClient/CodeClient";

export interface RaccoonAgent {
  id: string;
  label: string;
  icon: string;
  systemPrompt: string;
  knowledges: KnowledgeBase[];
}

export class AgentInfo {
  private _agent: RaccoonAgent;
  constructor(agent: RaccoonAgent) {
    this._agent = agent;
  }

  public get label(): string {
    return this._agent.label;
  }
}

export const builtinAgents: RaccoonAgent[] = [
  {
    id: "小浣熊",
    label: l10n.t("Raccoon"),
    icon: "pets",
    systemPrompt: l10n.t(""),
    knowledges: []
  }/*,
  {
    id: "martin",
    label: l10n.t("Manager"),
    icon: "manage_accounts",
    systemPrompt: l10n.t(""),
    knowledges: []
  },
  {
    id: "andy",
    label: l10n.t("Architect"),
    icon: "design_services",
    systemPrompt: l10n.t(""),
    knowledges: []
  },
  {
    id: "eason",
    label: l10n.t("Engineer"),
    icon: "build_circle",
    systemPrompt: l10n.t(""),
    knowledges: []
  },
  {
    id: "taylor",
    label: l10n.t("Testing"),
    icon: "science",
    systemPrompt: l10n.t(""),
    knowledges: []
  },
  {
    id: "doris",
    label: l10n.t("Deployment"),
    icon: "deployed_code",
    systemPrompt: l10n.t(""),
    knowledges: []
  }*/
];

export class AgentEditor implements CustomReadonlyEditorProvider, Disposable {
  static instance?: AgentEditor;
  private webview?: Webview;

  private constructor(private readonly context: ExtensionContext) {
    workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration(`${extensionNameCamel}.Agent`)) {
        if (this.webview) {
          this.renderList(this.webview);
        }
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

  private getAgentItems(label: string): RaccoonAgent {
    let ps = raccoonManager.agent;
    let t = ps.filter((p) => (p.label === label));
    return t[0];
  }

  private async appendAgent(label: string, systemPrompt: string, overwrite?: boolean): Promise<void> {
    let cfg = workspace.getConfiguration(extensionNameCamel, undefined);
    let customAgents: { [key: string]: string | any } = {};
    let writeable = true;
    if (cfg) {
      customAgents = cfg.get("Agent", {});
      if (!overwrite) {
        for (let labelName in customAgents) {
          if (typeof customAgents[labelName] === 'object') {
            if (labelName === label) {
              writeable = false;
            }
          }
        }
      }
    }
    if (!writeable) {
      await window.showWarningMessage(l10n.t("The agent already exists, overwrite it?"), l10n.t("Cancel"), l10n.t("Overwrite")).then(res => {
        if (res === l10n.t("Overwrite")) {
          writeable = true;
        }
      }, () => { });
    }
    if (!writeable) {
      return Promise.reject();
    }
    let savep: any = { systemPrompt };
    return cfg.update("Agent", { ...customAgents, [label]: savep }, true);
  }

  private async removeAgentItem(label: string) {
    let cfg = workspace.getConfiguration(extensionNameCamel, undefined);
    let customPrompts: { [key: string]: string | any } = {};
    if (cfg) {
      customPrompts = cfg.get("Agent", {});
      for (let labelName in customPrompts) {
        if (labelName === label) {
          customPrompts[labelName] = undefined;
          cfg.update("Agent", customPrompts, true);
          return;
        }
      }
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
      return this.AgentEditorPage(webviewPanel);
    } else {
      let msg = JSON.parse(document.uri.fragment);
      this.AgentEditorPage(webviewPanel, msg.label, msg.systemPrompt);
    }
  }

  async AgentEditorPage(panel: WebviewPanel, label?: string, systemPrompt?: string) {
    let webview = panel.webview;
    webview.options = {
      enableScripts: true
    };
    webview.onDidReceiveMessage((msg) => {
      switch (msg.type) {
        case 'save': {
          this.appendAgent(msg.label, msg.prompt, msg.force).then(() => {
            if (label && label !== msg.label) {
              this.removeAgentItem(label);
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
      var prompt = document.getElementById("prompt").value;
      vscode.postMessage(
        {
          "type": "save",
          "force": label === old,
          "label": label,
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
    window.onload = (event) => {
      var prompt = document.getElementById("prompt");
      prompt.value = ${systemPrompt || ""};
      var labelNode = document.getElementById("label");
      var saveNode = document.getElementById("save");
      labelNode.addEventListener("input", (_e)=>{
        if (labelNode.value && /^[a-zA-Z]\\w{0,15}$/.test(labelNode.value)){
          saveNode.disabled = false;
        } else {
          saveNode.disabled = true;
        }
      });
      labelNode.focus();
    };
    </script>
    </head>
    <body>
    <div class="markdown-body" style="margin: 1rem 4rem;">
      <h2>${l10n.t("Custom Agent")}</h2>
      <div style="display: flex; flex-direction: column;">
        <div style="display: flex; grid-gap: 1rem; flex-flow: wrap">
          <vscode-text-field id="label" tabindex="1" placeholder="${l10n.t("Display label")}" style="white-space: normal; flex-grow: 3; font-family: var(--vscode-editor-font-family);" maxlength="16" ${label && `value="${label}"`}>${l10n.t("Label")}
            <vscode-link slot="start" tabindex="-1" style="cursor: help;" href="#" title="${l10n.t("Display label")}">
              <span class="material-symbols-rounded">smart_button</span>
            </vscode-link>
          </vscode-text-field>
        </div>
        <div style="display: flex; grid-gap: 0 1rem; flex-flow: wrap">
          <div style="display: flex;flex-direction: column;min-width: 320px;flex-grow: 50;margin-top: 1rem;">
            <label for="prompt" style="display: block;line-height: normal;margin-bottom: 4px;font-family: var(--vscode-editor-font-family);">${l10n.t("Custom Prompt")}</label>
            <div class="flex gap-1 p-1" style="border-radius: 6px 6px 0 0;background-color: var(--input-background);border-bottom: 1px dashed var(--vscode-dropdown-border);height: 33px;z-index: 1;width: calc(100% - 2px);margin: 0 1px;">
            </div>
            <textarea tabindex="3" id="prompt" rows="10" resize="vertical" style="border-radius: 6px;padding: 43px 9px 9px 9px;margin-top: -34px;outline-color: var(--vscode-focusBorder);font-family: var(--vscode-editor-font-family);height: 268px;border: 1px solid var(--vscode-dropdown-border);">
            </textarea>
          </div>
        </div>
        <div style="display: flex; margin-top: 1rem; align-self: flex-end; grid-gap: 1rem;">
          <vscode-button tabindex="5" appearance="secondary" onclick="cancel()" style="--button-padding-horizontal: 2rem;">${l10n.t("Cancel")}</vscode-button>
          <vscode-button tabindex="4" id="save" ${(label && label.length > 0) ? '' : 'disabled'} onclick="save('${label}')" style="--button-padding-horizontal: 2rem;">${l10n.t("Save")}</vscode-button>
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
        case 'add': {
          commands.executeCommand("vscode.openWith", Uri.parse(`${extensionNameKebab}://raccoon.agent/new.raccoon.agent?${encodeURIComponent(JSON.stringify({ title: `${l10n.t("Custom Prompt")} [${l10n.t("New")}]` }))}`), agentEditorViewType);
          break;
        }
        case 'edit': {
          let agent = this.getAgentItems(msg.label);
          if (agent) {
            commands.executeCommand("vscode.openWith", Uri.parse(`${extensionNameKebab}://raccoon.agent/edit.raccoon.agent?${encodeURIComponent(JSON.stringify({ title: `${l10n.t("Custom Prompt")} [${agent.label}]` }))}#${encodeURIComponent(JSON.stringify(agent))}`), agentEditorViewType);
          }
          break;
        }
        case 'delete': {
          this.removeAgentItem(msg.label);
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

    let agents: RaccoonAgent[] = raccoonManager.agent;

    let emptyPlaceholder = `
    <div style="text-align: center;margin: 10% 0; opacity: 0.3; user-select: none;">
      <span class="material-symbols-rounded" style="font-size: 4rem; font-variation-settings: 'FILL' 0, 'wght' 300, 'GRAD' 0, 'opsz' 48;">folder_open</span>
      <div style="font-family: var(--vscode-editor-font-family);">No Custom Agent</div>
    </div>`;
    let table = `
    <vscode-data-grid aria-label="Basic" generate-header="sticky" grid-template-columns="1fr 2fr calc(20ch + 24px) 84px" style="--font-family: var(--vscode-editor-font-family); border-top: 1px solid; border-bottom: 1px solid; border-color: var(--dropdown-border); min-width: calc( 48ch + 380px);">
      <vscode-data-grid-row row-type="sticky-header">
      <vscode-data-grid-cell cell-type="columnheader" grid-column="1">${l10n.t("Label")}</vscode-data-grid-cell>
      <vscode-data-grid-cell cell-type="columnheader" grid-column="2">${l10n.t("Custom Prompt")}</vscode-data-grid-cell>
      <vscode-data-grid-cell cell-type="columnheader" grid-column="4">${l10n.t("Action")}</vscode-data-grid-cell>
      </vscode-data-grid-row>
    `;
    for (let s of agents) {
      emptyPlaceholder = '';
      table += `
      <vscode-data-grid-row id="${s.label}" style="border-top: 1px solid; border-color: var(--dropdown-border);">
        <vscode-data-grid-cell grid-column="1" style="align-self: center;" title="${s.label}" onclick="editAgent('${s.label}')"><vscode-link>${s.label}</vscode-link></vscode-data-grid-cell>
        <vscode-data-grid-cell grid-column="2" style="align-self: center; overflow-x: auto; white-space: pre;">${s.systemPrompt || ""}</vscode-data-grid-cell>
        <vscode-data-grid-cell grid-column="4" style="align-self: center;">
          <vscode-link>
            <span class="material-symbols-rounded edit-agent" onclick="editAgent('${s.label}')">edit</span>
          </vscode-link>
          <vscode-link>
            <span class="material-symbols-rounded delete-agent" onclick="deleteByLabel('${s.label}')">delete</span>
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
    document.oncontextmenu = () => {
      return false;
    };
    const vscode = acquireVsCodeApi();
    function addAgent() {
      vscode.postMessage(
        {
          "type": "add"
        }
      )
    }
    function editAgent(label) {
      vscode.postMessage(
        {
          "type": "edit",
          "label": label
        }
      )
    }
    function deleteByLabel(label) {
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
      <h2>${l10n.t("Custom Agent")} ${l10n.t("List")}</h2>
      <div style="display: flex; justify-content: flex-end; margin: 0.5rem;">
        <vscode-button onclick="addAgent()">${l10n.t("Create")}<span slot="start" class="material-symbols-rounded">bookmark_add</span></vscode-button>
      </div>
      <div style="display: flex;flex-direction: column;">
        ${emptyPlaceholder || table}
      </div>
      </div>
    </body>
    </html>`;
  }
}
