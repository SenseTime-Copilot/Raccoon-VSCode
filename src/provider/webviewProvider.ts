import { IncomingMessage } from 'http';
import { window, workspace, WebviewViewProvider, TabInputText, TabInputNotebook, WebviewView, ExtensionContext, WebviewViewResolveContext, CancellationToken, SnippetString, commands, Webview, Uri, l10n, ViewColumn, env, ProgressLocation, TextEditor, Disposable } from 'vscode';
import { configuration, outlog, telemetryReporter } from '../extension';
import { Prompt } from '../param/configures';
import { GetCodeCompletions, getCodeCompletions } from "../utils/getCodeCompletions";
import { getDocumentLanguage } from '../utils/getDocumentLanguage';

const guide = `
      <h3>${l10n.t("Coding with SenseCode")}</h3>
      <ol>
      <li>
        ${l10n.t("Stop typing or press hotkey (default: <code>Alt+/</code>) to starts SenseCode thinking")}:
        <div class="flex leading-4 p-2 m-2 rounded" style="font-family: var(--vscode-editor-font-family);background-color: var(--vscode-editor-background);border: 1px solid var(--vscode-editor-lineHighlightBorder);">
          <span style="color: var(--vscode-symbolIcon-functionForeground);">print</span>
          <span style="border-left: 2px solid var(--vscode-editorCursor-foreground);animation: pulse 1s step-start infinite;" class="animate-pulse"></span>
          <span style="color: var(--foreground); opacity: 0.4;">("hello world");</span>
        </div>
      </li>
      <li>
      ${l10n.t("When multi candidates generated, use <code>Alt+[</code> or <code>Alt+]</code> to switch between them")}:
        <div class="flex leading-4 p-2 m-2 rounded" style="font-family: var(--vscode-editor-font-family);background-color: var(--vscode-editor-background);border: 1px solid var(--vscode-editor-lineHighlightBorder);">
          <span style="color: var(--vscode-symbolIcon-functionForeground);">print</span>
          <span style="border-left: 2px solid var(--vscode-editorCursor-foreground);animation: pulse 1s step-start infinite;" class="animate-pulse"></span>
          <span style="color: var(--foreground); opacity: 0.4;">("hello", "world");</span>
        </div>
      </li>
      <li>
      ${l10n.t("Accepct the chosen code snippet with <code>Tab</code> key")}:
        <div class="flex leading-4 p-2 m-2 rounded" style="font-family: var(--vscode-editor-font-family);background-color: var(--vscode-editor-background);border: 1px solid var(--vscode-editor-lineHighlightBorder);">
          <span style="color: var(--vscode-symbolIcon-functionForeground);">print</span>
          <span style="color: var(--vscode-symbolIcon-colorForeground);">(</span>
          <span style="color: var(--vscode-symbolIcon-enumeratorForeground);">"hello"</span>
          <span style="color: var(--vscode-symbolIcon-colorForeground);">,</span>
          <span style="color: var(--vscode-symbolIcon-enumeratorForeground);">"world"</span>
          <span style="color: var(--vscode-symbolIcon-colorForeground);">);</span>
        </div>
      </li>
      </ol>
      <h3>${l10n.t("Ask SenseCode")}</h3>
      <ol>
      <li>
      ${l10n.t("Select code in editor")}:
        <div class="leading-4 p-2 m-2 rounded" style="font-family: var(--vscode-editor-font-family);background-color: var(--vscode-editor-background);border: 1px solid var(--vscode-editor-lineHighlightBorder);">
        <div  class="flex" style="width: fit-content;background-color: var(--vscode-editor-selectionBackground);">
          <span style="color: var(--vscode-symbolIcon-functionForeground);">print</span>
          <span style="color: var(--vscode-symbolIcon-colorForeground);">(</span>
          <span style="color: var(--vscode-symbolIcon-enumeratorForeground);">"hello"</span>
          <span style="color: var(--vscode-symbolIcon-colorForeground);">,</span>
          <span style="color: var(--vscode-symbolIcon-enumeratorForeground);">"world"</span>
          <span style="color: var(--vscode-symbolIcon-colorForeground);">);</span>
        </div>
        </div>
      </li>
      <li>
      ${l10n.t("Select prompt/write your question in input box at bottom, complete the prompt (if necessary), and send them to ask SenseCode")}:
          <a onclick="document.getElementById('question-input').focus();" style="text-decoration: none;cursor: pointer;">
            <div class="flex p-1 px-2 m-2 text-xs flex-row-reverse" style="border: 1px solid var(--panel-view-border);background-color: var(--input-background);"><span style="color: var(--input-placeholder-foreground);" class="material-symbols-rounded">send</span></div>
          </a>
      </li>
      <li>
      ${l10n.t("Or, select prompt without leaving the editor by pressing hotkey (default: <code>Alt+/</code>)")}:
            <div class="flex flex-col m-2 text-xs" style="border: 1px solid var(--vscode-editorSuggestWidget-border);background-color: var(--vscode-editorSuggestWidget-background);">
            <div class="flex py-1 pl-2 gap-2"><span style="color: var(--vscode-editorLightBulb-foreground); font-variation-settings: 'FILL' 1;" class="material-symbols-rounded">lightbulb</span><span style="background-color: var(--progress-background);opacity: 0.3;width: 70%;"></span></div>
            <div class="flex py-1 pl-2 gap-2"><span style="color: var(--vscode-editorLightBulb-foreground); font-variation-settings: 'FILL' 1;" class="material-symbols-rounded">lightbulb</span><span style="background-color: var(--progress-background);opacity: 0.3;width: 50%;" class="animate-pulse"></span></div>
            <div class="flex py-1 pl-2 gap-2"><span style="color: var(--vscode-editorLightBulb-foreground); font-variation-settings: 'FILL' 1;" class="material-symbols-rounded">lightbulb</span><span style="background-color: var(--progress-background);opacity: 0.3;width: 60%;"></span></div>
      </li>
      </ol>
      <p>
      ${l10n.t("Read SenseCode document for more information")} <a href="vscode:extension/sensetime.sensecode"><span class="material-symbols-rounded">keyboard_double_arrow_right</span></a>
      </p>
      `;

export class SenseCodeEditor extends Disposable {
  private stopList: { [key: number]: AbortController };
  private lastTextEditor?: TextEditor;
  private disposing = false;

  constructor(private context: ExtensionContext, private webview: Webview) {
    super(() => { });
    this.stopList = {};
    this.lastTextEditor = window.activeTextEditor;
    context.subscriptions.push(
      workspace.onDidChangeConfiguration((e) => {
        if (e.affectsConfiguration("SenseCode")) {
          configuration.update();
          if (e.affectsConfiguration("SenseCode.Prompt")) {
            this.sendMessage({ type: 'promptList', value: configuration.prompt });
          }
          if (e.affectsConfiguration("SenseCode.Engines")) {
            this.updateSettingPage("full");
          }
        }
      })
    );
    context.subscriptions.push(
      context.secrets.onDidChange((e) => {
        if (e.key === "sensecode.token") {
          configuration.update();
          this.updateSettingPage("full");
          let engine = configuration.getActiveEngine();
          configuration.getApiKeyRaw(engine).then(async (key) => {
            let username: string | undefined = await configuration.username(engine);
            if (!username && key) {
              username = l10n.t("{0} User", engine);
            }
            let welcomMsg = l10n.t("Welcome<b>{0}</b>, I'm <b>{1}</b>, your code assistant. You can ask me any technical question, or ask me to help you with your code.", `${username ? ` @${username}` : ""}`, l10n.t("SenseCode"));
            this.sendMessage({ type: 'addMessage', category: "welcome", value: welcomMsg + guide });
          }, () => {
            this.sendMessage({ type: 'addMessage', category: "no-account", value: l10n.t("It seems that you have not had an account to <b>{0}</b>, set it in <vscode-link href=\"{1}\">setting page</vscode-link>.", engine, `${Uri.parse(`command:sensecode.settings`)}`) });
          });
        }
      })
    );
    context.subscriptions.push(
      window.onDidChangeActiveTextEditor((e) => {
        if (e && (e.document.uri.scheme === "file" || e.document.uri.scheme === "git" || e.document.uri.scheme === "untitled")) {
          this.lastTextEditor = e;
        }
      })
    );
    context.subscriptions.push(
      window.onDidChangeTextEditorSelection(e => {
        if (e.textEditor.document.uri.scheme === "file" || e.textEditor.document.uri.scheme === "git" || e.textEditor.document.uri.scheme === "untitled") {
          this.sendMessage({ type: 'codeReady', value: (e.selections[0] && !e.selections[0].isEmpty) ? true : false });
        }
      })
    );
    this.showPage();
  }

  dispose() {
    this.disposing = true;
  }

  async updateSettingPage(action?: string): Promise<void> {
    let autoComplete = configuration.autoComplete;
    let streamResponse = configuration.streamResponse;
    let delay = configuration.delay;
    let candidates = configuration.candidates;
    let tokenPropensity = configuration.tokenPropensity;
    const activeEngine = configuration.getActiveEngineInfo();
    let key = activeEngine.key || await configuration.getApiKey(activeEngine.label);
    let setPromptUri = Uri.parse(`command:workbench.action.openGlobalSettings?${encodeURIComponent(JSON.stringify({ query: "SenseCode.Prompt" }))}`);
    let setEngineUri = Uri.parse(`command:workbench.action.openGlobalSettings?${encodeURIComponent(JSON.stringify({ query: "SenseCode.Engines" }))}`);
    let es = configuration.engines;
    let esList = `<vscode-dropdown id="engineDropdown" class="w-full" value="${activeEngine.label}">`;
    for (let e of es) {
      esList += `<vscode-option value="${e.label}">${e.label}</vscode-option>`;
    }
    esList += "</vscode-dropdown>";
    let loginout = `<vscode-link class="justify-end" title="${l10n.t("Login")}" href="https://sso.sensetime.com/enduser/sp/sso/sensetimeplugin_jwt102?enterpriseId=sensetime">
                    <span class="material-symbols-rounded">login</span>
                  </vscode-link>`;
    if (key) {
      loginout = `<vscode-link class="justify-end" title="${l10n.t("Logout")}">
                    <span id="clearKey" class="material-symbols-rounded">logout</span>
                  </vscode-link>`;
    }
    let username: string | undefined = await configuration.username(activeEngine.label);
    if (!username && key) {
      username = l10n.t("{0} User", activeEngine.label);
    }
    let sensetimeFlag = configuration.sensetimeEnv && activeEngine.sensetimeOnly;
    let accountInfo = `
        <div class="flex gap-2 items-center w-full">
          <span class="material-symbols-rounded" style="font-size: 40px; font-variation-settings: 'opsz' 48;">person_pin</span>
          <span class="grow capitalize font-bold text-base">${username || l10n.t("Unknown")}</span>
          ${sensetimeFlag ? loginout : ``}
        </div>
        `;
    let avatar = await configuration.avatar(activeEngine.label);
    if (avatar) {
      accountInfo = `
        <div class="flex gap-2 items-center w-full">
          <img class="w-10 h-10 rounded-full" src="${avatar}" />
          <span class="grow capitalize font-bold text-base">${username || l10n.t("Unknown")}</span>
          ${sensetimeFlag ? loginout : ``}
        </div>
        `;
    }

    let keycfg = "";
    if (!key) {
      keycfg = `
          <span class="flex">
            <span class="material-symbols-rounded attach-btn-left" style="padding: 3px;">privacy_tip</span>
            <vscode-text-field readonly placeholder="Not set" style="font-family: var(--vscode-editor-font-family);flex-grow: 1;">
            </vscode-text-field>
            <vscode-link class="attach-btn-right" style="padding: 0 3px;" title="${l10n.t("Set API Key")}">
              <span id="setKey" class="material-symbols-rounded">key</span>
            </vscode-link>
          </span>`;
    } else {
      let len = key.length;
      let keyMasked = '*'.repeat(len);
      if (key.length > 10) {
        let showCharCnt = Math.min(Math.floor(len / 4), 7);
        let maskCharCnt = Math.min(len - (showCharCnt * 2), 12);
        keyMasked = `${key.slice(0, showCharCnt)}${'*'.repeat(maskCharCnt)}${key.slice(-1 * showCharCnt)}`;
      }
      if (activeEngine.key) {
        keycfg = `
          <span class="flex">
            <span class="material-symbols-rounded attach-btn-left" style="padding: 3px;" title="${l10n.t("API Key that in settings is adopted")}">password</span>
            <vscode-text-field readonly placeholder="${keyMasked}" style="font-family: var(--vscode-editor-font-family);flex-grow: 1;"></vscode-text-field>
            <vscode-link href="${setEngineUri}" class="attach-btn-right" style="padding: 0 3px;" title="${l10n.t("Reveal in settings")}">
              <span class="material-symbols-rounded">visibility</span>
            </vscode-link>
          </span>`;
      } else {
        keycfg = `
          <span class="flex">
            <span class="material-symbols-rounded attach-btn-left" style="padding: 3px;" title="${l10n.t("API Key that in secret storage is adopted")}">security</span>
            <vscode-text-field readonly placeholder="${keyMasked}" style="font-family: var(--vscode-editor-font-family);flex-grow: 1;"></vscode-text-field>
            <vscode-link class="attach-btn-right" style="padding: 0 3px;" title="${l10n.t("Logout & clear API Key from Secret Storage")}">
              <span id="clearKey" class="material-symbols-rounded">key_off</span>
            </vscode-link>
          </span>`;
      }
    }
    let settingPage = `
    <div id="settings" class="h-screen select-none flex flex-col gap-2 mx-auto p-4 max-w-sm">
      <div class="immutable fixed top-3 right-4">
        <span class="cursor-pointer material-symbols-rounded" onclick="document.getElementById('settings').remove();document.getElementById('question-input').focus();">close</span>
      </div>
      <div class="immutable flex flex-col mt-4 px-2 gap-2">
        <div class="flex flex-row gap-2 mx-2 items-center justify-between">
          ${accountInfo}
        </div>
      </div>
      <vscode-divider style="border-top: calc(var(--border-width) * 1px) solid var(--panel-view-border);"></vscode-divider>
      <b>${l10n.t("Service")}</b>
      <div class="flex flex-col ml-4 my-2 px-2 gap-2">
        <span>${l10n.t("Code engine")}</span>
        <div class="flex flex-row">
          <span class="material-symbols-rounded attach-btn-left" style="padding: 3px;" title="${l10n.t("Code engine")}">assistant</span>
          ${esList}
          <vscode-link href="${setEngineUri}" class="pt-px attach-btn-right" title="${l10n.t("Settings")}">
            <span class="material-symbols-rounded">tune</span>
          </vscode-link>
        </div>
      </div>
      <div class="ml-4">
        <div class="flex flex-col grow my-2 px-2 gap-2">
          <span>${l10n.t("API Key")}</span>
          ${keycfg}
        </div>
      </div>
      <vscode-divider style="border-top: calc(var(--border-width) * 1px) solid var(--panel-view-border);"></vscode-divider>
      <b>${l10n.t("Inline completion")}</b>
      <div class="ml-4">
        <div>
        <vscode-radio-group id="triggerModeRadio" class="flex flex-wrap px-2">
          <label slot="label">${l10n.t("Trigger Mode")}</label>
          <vscode-radio ${autoComplete ? "checked" : ""} class="w-32" value="Auto" title="${l10n.t("Get completion suggestions once stop typing")}">
            ${l10n.t("Auto")}
            <span id="triggerDelay" class="${autoComplete ? "" : "hidden"}">
              <vscode-link id="triggerDelayShortBtn" class="${delay === 1 ? "" : "hidden"}" style="margin: -4px 0;" title="${l10n.t("Short delay")}">
                <span id="triggerDelayShort" class="material-symbols-rounded">timer</span>
              </vscode-link>
              <vscode-link id="triggerDelayLongBtn" class="${delay !== 1 ? "" : "hidden"}" style="margin: -4px 0;" title="${l10n.t("Delay 3 senconds")}">
                <span id="triggerDelayLong" class="material-symbols-rounded">timer_3_alt_1</span>
              </vscode-link>
            </span>
          </vscode-radio>
          <vscode-radio ${autoComplete ? "" : "checked"} class="w-32" value="Manual" title="${l10n.t("Get completion suggestions on keyboard event")}">
            ${l10n.t("Manual")}
            <vscode-link href="${Uri.parse(`command:workbench.action.openGlobalKeybindings?${encodeURIComponent(JSON.stringify("sensecode.inlineSuggest.trigger"))}`)}" id="keyBindingBtn" class="${autoComplete ? "hidden" : ""}" style="margin: -4px 0;" title="${l10n.t("Set keyboard shortcut")}">
              <span class="material-symbols-rounded">keyboard</span>
            </vscode-link>
          </vscode-radio>
        </vscode-radio-group>
        </div>
      </div>
      <div class="ml-6 my-2">
        <span>${l10n.t("Suggestion Settings")}</span>
        <div class="w-64 my-2">
          <div class="flex flex-row my-2 px-2 gap-2">
            <span class="material-symbols-rounded mx-1">format_list_numbered</span>
            ${l10n.t("Candidate Number")}
            <span id="candidatesBtn" class="flex items-center">
              <vscode-link style="margin: -4px 0;" title="${l10n.t("Show {0} candidate snippet(s)", candidates)}">
                <span id="candidates" class="material-symbols-rounded" data-value=${candidates}>${candidates === 1 ? "looks_one" : `filter_${candidates}`}</span>
              </vscode-link>
            </span>
          </div>
          <div class="flex flex-row my-2 px-2 gap-2">
            <span class="material-symbols-rounded mx-1">generating_tokens</span>
            ${l10n.t("Token Propensity")}
            <span id="tokenPropensityBtn" class="flex items-center">
              <vscode-link style="margin: -4px 0;" title="${l10n.t("Use {0}% tokens to prompt, {1}% tokens to generate response", tokenPropensity, 100 - tokenPropensity)}">
                <span id="tokenPropensity" class="material-symbols-rounded" data-value=${tokenPropensity}>clock_loader_${tokenPropensity}</span>
              </vscode-link>
            </span>
          </div>
        </div>
      </div>
      <vscode-divider style="border-top: calc(var(--border-width) * 1px) solid var(--panel-view-border);"></vscode-divider>
      <b>${l10n.t("Code assistant")}</b>
      <div class="ml-4">
        <div>
        <vscode-radio-group id="responseModeRadio" class="flex flex-wrap px-2">
          <label slot="label">${l10n.t("Show respoonse")}</label>
          <vscode-radio ${streamResponse ? "checked" : ""} class="w-32" value="Streaming" title="${l10n.t("Display the response streamingly, you can stop it at any time")}">
            ${l10n.t("Streaming")}
          </vscode-radio>
          <vscode-radio ${streamResponse ? "" : "checked"} class="w-32" value="Monolithic" title="${l10n.t("Wait entire result returned, and display at once")}">
            ${l10n.t("Monolithic")}
          </vscode-radio>
        </vscode-radio-group>
        </div>
      </div>
      <vscode-divider style="border-top: calc(var(--border-width) * 1px) solid var(--panel-view-border);"></vscode-divider>
      <b>${l10n.t("Advanced")}</b>
      <div class="ml-4">
        <div class="flex flex-row my-2 px-2 gap-2">
          <span>${l10n.t("Custom prompt")}</span>
          <vscode-link href="${setPromptUri}" style="margin: -1px 0;"><span class="material-symbols-rounded">auto_fix</span></vscode-link>
        </div>
        <div class="flex flex-row my-2 px-2 gap-2">
          <span>${l10n.t("Clear all settings")}</span>
          <vscode-link style="margin: -1px 0;"><span id="clearAll" class="material-symbols-rounded">settings_power</span></vscode-link>
        </div>
      </div>
      <vscode-divider style="border-top: calc(var(--border-width) * 1px) solid var(--panel-view-border);padding-bottom: 4rem;"></vscode-divider>
    </div>
    `;
    this.sendMessage({ type: 'updateSettingPage', value: settingPage, action });
  }

  public async showPage(
  ) {
    this.webview.options = {
      enableScripts: true,
      enableCommandUris: true,
      localResourceRoots: [
        this.context.extensionUri
      ]
    };

    this.webview.html = await this.getWebviewHtml(this.webview);
    this.webview.onDidReceiveMessage(async data => {
      switch (data.type) {
        case 'listPrompt': {
          this.sendMessage({ type: 'promptList', value: configuration.prompt });
          break;
        }
        case 'prepareQuestion': {
          let selection: string = "";
          const editor = this.lastTextEditor;
          let lang = "";
          let promptType = data.value?.type;
          let prompt = data.value?.prompt;
          if (editor) {
            if (promptType === "custom" && !prompt.includes("${code}")) {
            } else {
              selection = editor.document.getText(editor.selection);
              lang = editor.document.languageId;
            }
          }
          if (data.value) {
            this.sendApiRequest(data.value, selection, lang);
          }
          break;
        }
        case 'sendQuestion': {
          this.sendApiRequest(data.value, data.code || "", data.lang);
          break;
        }
        case 'stopGenerate': {
          if (data.id) {
            this.stopList[data.id].abort();
            this.sendMessage({ type: 'stopResponse', id: data.id, byUser: true });
          } else {
            for (let id in this.stopList) {
              this.stopList[id].abort();
              this.sendMessage({ type: 'stopResponse', id, byUser: true });
            }
          }
          break;
        }
        case 'editCode': {
          let found = false;
          let docUri = this.lastTextEditor?.document.uri;
          if (docUri) {
            let tgs = window.tabGroups.all;
            for (let tg of tgs) {
              for (let t of tg.tabs) {
                if (t.isActive && (t.input instanceof TabInputText || t.input instanceof TabInputNotebook) && t.input.uri.toString() === docUri.toString()) {
                  found = true;
                  this.lastTextEditor?.insertSnippet(new SnippetString(data.value)).then(async (_v) => {
                    await new Promise((f) => setTimeout(f, 200));
                    commands.executeCommand("editor.action.formatDocument", docUri);
                  }, () => { });
                }
              }
            }
          }
          if (!found) {
            this.sendMessage({ type: 'showError', category: 'no-active-editor', value: l10n.t("No active editor found"), id: new Date().valueOf() });
          }
          break;
        }
        case 'openNew': {
          const document = await workspace.openTextDocument({
            content: data.value,
            language: data.language
          });
          window.showTextDocument(document);
          break;
        }
        case 'activeEngine': {
          configuration.setActiveEngine(data.value);
          this.updateSettingPage("full");
          break;
        }
        case 'setKey': {
          await window.showInputBox({ title: `${l10n.t("SenseCode: Input your Key...")}`, password: true, ignoreFocusOut: true }).then(async (v) => {
            configuration.setApiKey(configuration.getActiveEngine(), v).then((ok) => {
              if (!ok) {
                this.sendMessage({ type: 'showError', category: 'invalid-key', value: l10n.t("Invalid API Key"), id: new Date().valueOf() });
              }
            }, (_err) => {
              this.sendMessage({ type: 'showError', category: 'invalid-key', value: l10n.t("Invalid API Key"), id: new Date().valueOf() });
            });
          });
          break;
        }
        case 'clearKey': {
          let ae = configuration.getActiveEngine();
          window.showWarningMessage(
            l10n.t("Logout & clear API Key for {0} from Secret Storage?", ae),
            { modal: true },
            l10n.t("OK"))
            .then((v) => {
              if (v === l10n.t("OK")) {
                configuration.setApiKey(ae, undefined);
              }
            });
          break;
        }
        case 'triggerMode': {
          if (configuration.autoComplete !== (data.value === "Auto")) {
            configuration.autoComplete = (data.value === "Auto");
            this.updateSettingPage();
          }
          break;
        }
        case 'responseMode': {
          if (configuration.streamResponse !== (data.value === "Streaming")) {
            configuration.streamResponse = (data.value === "Streaming");
            this.updateSettingPage();
          }
          break;
        }
        case 'delay': {
          if (data.value !== configuration.delay) {
            configuration.delay = data.value;
            this.updateSettingPage();
          }
          break;
        }
        case 'candidates': {
          if (data.value <= 0) {
            data.value = 1;
          }
          configuration.candidates = data.value;
          this.updateSettingPage();
          break;
        }
        case 'tokenPropensity': {
          if (data.value <= 0) {
            data.value = 20;
          }
          if (data.value >= 100) {
            data.value = 80;
          }
          configuration.tokenPropensity = Math.floor(data.value / 20) * 20;
          this.updateSettingPage();
          break;
        }
        case 'clearAll': {
          window.showWarningMessage(
            l10n.t("Clear all settings?"),
            { modal: true, detail: l10n.t("It will clear all settings, includes API Keys.") },
            l10n.t("OK"))
            .then(v => {
              if (v === l10n.t("OK")) {
                configuration.clear();
              }
            });
          break;
        }
        case 'correct': {
          if (!env.isTelemetryEnabled) {
            window.showInformationMessage("Thanks for your feedback, Please enable `telemetry.telemetryLevel` to send data to us.", "OK").then((v) => {
              if (v === "OK") {
                commands.executeCommand("workbench.action.openGlobalSettings", { query: "telemetry.telemetryLevel" });
              }
            });
            break;
          }
          let panel = window.createWebviewPanel("sensecode.correction", `Code Correction-${data.info.generate_at}`, ViewColumn.Beside, { enableScripts: true });
          let webview = panel.webview;
          webview.options = {
            enableScripts: true
          };
          webview.onDidReceiveMessage((msg) => {
            switch (msg.type) {
              case 'sendFeedback': {
                window.withProgress({ location: ProgressLocation.Notification, title: "Feedback" }, async (progress, _) => {
                  progress.report({ message: "Sending feedback..." });
                  let correction =
                    `\`\`\`${msg.language}
${msg.code}
\`\`\`
                `;
                  let info = { action: "correct", correction, ...data.info };
                  telemetryReporter.logUsage(data.info.event, info);
                  await new Promise((f) => setTimeout(f, 2000));
                  panel.dispose();
                  progress.report({ message: "Thanks for your feedback.", increment: 100 });
                  await new Promise((f) => setTimeout(f, 2000));
                  return Promise.resolve();
                });
                break;
              }
            }
          });
          const vendorHighlightCss = webview.asWebviewUri(Uri.joinPath(this.context.extensionUri, 'media', 'vendor', 'highlight.min.css'));
          const vendorHighlightJs = webview.asWebviewUri(Uri.joinPath(this.context.extensionUri, 'media', 'vendor', 'highlight.min.js'));
          const vendorMarkedJs = webview.asWebviewUri(Uri.joinPath(this.context.extensionUri, 'media', 'vendor', 'marked.min.js'));
          const toolkitUri = webview.asWebviewUri(Uri.joinPath(this.context.extensionUri, "media", "toolkit.js"));
          const mainCSS = webview.asWebviewUri(Uri.joinPath(this.context.extensionUri, 'media', 'main.css'));
          webview.html = `
          <html>
          <head>
          <meta http-equiv="Content-Security-Policy" content="default-src 'none'; font-src ${webview.cspSource};  style-src ${webview.cspSource} 'unsafe-inline'; script-src ${webview.cspSource} 'unsafe-inline';" >
          <link href="${vendorHighlightCss}" rel="stylesheet">
          <script src="${vendorHighlightJs}"></script>
          <script src="${vendorMarkedJs}"></script>
          <script type="module" src="${toolkitUri}"></script>
          <link href="${mainCSS}" rel="stylesheet" />
          <script>
          marked.setOptions({
            renderer: new marked.Renderer(),
            highlight: function (code, _lang) {
              return hljs.highlightAuto(code).value;
            },
            langPrefix: 'hljs language-',
            pedantic: false,
            gfm: true,
            breaks: false,
            sanitize: false,
            smartypants: false,
            xhtml: false
          });
          const vscode = acquireVsCodeApi();
          function send() {
            vscode.postMessage(
              {
                "type": "sendFeedback",
                "language": "${data.info.request.language}",
                "code": document.getElementById("correction").value
              }
            )
          }
          window.addEventListener("message", (event) => {
            const message = event.data;
            switch (message.type) {
              case 'render': {
                const content = new DOMParser().parseFromString(marked.parse(message.content), "text/html");
                var container = document.getElementById("info");
                container.innerHTML = content.documentElement.innerHTML;
                break;
              }
            }
          });
          </script>
          </head>
          <body>
          <div class="markdown-body" style="margin: 1rem 4rem;">
            <div id="info"></div>
              <div style="display: flex;flex-direction: column;">
                <vscode-text-area id="correction" rows="20" resize="vertical" placeholder="Write your brilliant ${getDocumentLanguage(data.info.request.language)} code here..." style="margin: 1rem 0; font-family: var(--vscode-editor-font-family);"></vscode-text-area>
                <vscode-button button onclick="send()" style="--button-padding-horizontal: 2rem;align-self: flex-end;width: fit-content;">Feedback</vscode-button>
              </div>
            </div>
          </body>
          </html>`;
          let content = `
# Sincerely apologize for any inconvenience

SenseCode is still under development. Questions, patches, improvement suggestions and reviews welcome, we always looking forward to your feedback.

## Request

${data.info.request.prompt}

\`\`\`${data.info.request.language}
${data.info.request.code}
\`\`\`

## SenseCode response

${data.info.response}

## Your solution
`;
          await new Promise((f) => setTimeout(f, 200));
          webview.postMessage({ type: "render", content });
          break;
        }
        case 'telemetry': {
          if (!env.isTelemetryEnabled) {
            window.showInformationMessage("Thanks for your feedback, Please enable `telemetry.telemetryLevel` to send data to us.", "OK").then((v) => {
              if (v === "OK") {
                commands.executeCommand("workbench.action.openGlobalSettings", { query: "telemetry.telemetryLevel" });
              }
            });
            break;
          }
          telemetryReporter.logUsage(data.info.event, data.info);
          break;
        }
        default:
          break;
      }
    });
  }

  public async sendApiRequest(prompt: Prompt, code: string, lang?: string) {
    let response: string;
    let ts = new Date();
    let id = ts.valueOf();
    let timestamp = ts.toLocaleString();

    let send = true;
    let requireCode = true;
    let streaming = configuration.streamResponse;
    let instruction = prompt.prompt;
    if (instruction.includes("${input")) {
      send = false;
    }
    if (prompt.type === "free chat" || (prompt.type === "custom" && !instruction.includes("${code}"))) {
      requireCode = false;
    }

    let promptClone = { ...prompt };
    promptClone.prompt = instruction.replace("${code}", "");

    let engine = { ...configuration.getActiveEngineInfo() };

    let rs: GetCodeCompletions | IncomingMessage;
    try {
      let activeEngine = configuration.getActiveEngine();
      let apikey = await configuration.getApiKey(activeEngine);
      if (!apikey) {
        this.sendMessage({ type: 'addMessage', category: "no-account", value: l10n.t("It seems that you have not had an account to <b>{0}</b>, set it in <vscode-link href=\"{1}\">setting page</vscode-link>.", activeEngine, `${Uri.parse(`command:sensecode.settings`)}`) });
        this.sendMessage({ type: 'showError', category: 'key-not-set', value: l10n.t("API Key not set"), id });
        return;
      }

      if (requireCode && !code) {
        this.sendMessage({ type: 'showError', category: 'no-code', value: l10n.t("No code selected"), id });
        return;
      } else {
        if (code.length > configuration.tokenForPrompt(engine.label) * 3) {
          this.sendMessage({ type: 'showError', category: 'too-many-tokens', value: l10n.t("Prompt too long"), id });
          return;
        }
      }

      let instructionMsg = `Task type: ${prompt.type}. ${instruction}`;
      if (prompt.type === "custom" || prompt.type === "free chat") {
        instructionMsg = `Task type: Answer question. ${instruction.replace("${code}", '')}`;
      }

      let codeStr = "";
      if (code) {
        codeStr = `\`\`\`${lang ? lang.toLowerCase() : ""}\n${code}\n\`\`\``;
      } else {
        // codeStr = instruction;
        lang = "";
      }

      let username = await configuration.username(activeEngine);
      let avatar = await configuration.avatar(activeEngine);
      this.sendMessage({ type: 'addQuestion', username, avatar: avatar || undefined, value: promptClone, code, lang, send, id, streaming, timestamp });
      if (!send) {
        return;
      }

      let promptMsg = `Below is an instruction that describes a task. Write a response that appropriately completes the request.

### Instruction:
Answer this question: ${instructionMsg}

### Input:
${codeStr}

### Response:\n`;

      this.stopList[id] = new AbortController();
      engine.config.max_tokens = configuration.maxTokenForResponse(activeEngine);
      rs = await getCodeCompletions(engine, promptMsg, 1, streaming, this.stopList[id].signal);
      if (rs instanceof IncomingMessage) {
        let data = rs as IncomingMessage;
        data.on("data", async (v: any) => {
          if (this.stopList[id].signal.aborted || this.disposing) {
            delete this.stopList[id];
            data.destroy();
            return;
          }
          let msgstr: string = v.toString();
          let msgs = msgstr.split("\n");
          let errorFlag = false;
          for (let msg of msgs) {
            let content = "";
            if (msg.startsWith("data:")) {
              content = msg.slice(5).trim();
            } else if (msg.startsWith("event:")) {
              content = msg.slice(6).trim();
              outlog.error(content);
              if (content === "error") {
                errorFlag = true;
                // this.sendMessage({ type: 'addError', error: "streaming interrpted", id });
                // data.destroy();
              }
              // return;
              continue;
            }

            if (content === '[DONE]') {
              this.sendMessage({ type: 'stopResponse', id });
              outlog.debug(content);
              delete this.stopList[id];
              data.destroy();
              return;
            }
            if (!content) {
              continue;
            }
            if (errorFlag) {
              this.sendMessage({ type: 'addError', error: content, id });
              continue;
            }
            try {
              let json = JSON.parse(content);
              outlog.debug(JSON.stringify(json, undefined, 2));
              if (json.error) {
                this.sendMessage({ type: 'addError', error: json.error, id });
                delete this.stopList[id];
                data.destroy();
                return;
              } else if (json.choices && json.choices[0]) {
                let value = json.choices[0].text || json.choices[0].message?.content;
                if (value) {
                  if (json.choices[0]["finish_reason"] === "stop" && value === "</s>") {
                    value = "\n";
                  }
                  this.sendMessage({ type: 'addResponse', id, value });
                }
              }
            } catch (e) {
              outlog.error(content);
            }
          }
        });
      } else {
        response = rs.completions[0];
        outlog.debug(response);
        this.sendMessage({ type: 'addResponse', id, value: response });
        this.sendMessage({ type: 'stopResponse', id });
      }
    } catch (err: any) {
      if (err.message === "canceled") {
        delete this.stopList[id];
        this.sendMessage({ type: 'stopResponse', id });
        return;
      }
      let errInfo = err.message || err.response.data.error;
      outlog.error(errInfo);
      this.sendMessage({ type: 'addError', error: errInfo, id });
    }
  }

  public async sendMessage(message: any) {
    if (this.webview) {
      this.webview.postMessage(message);
    }
  }

  private async getWebviewHtml(webview: Webview) {
    const scriptUri = webview.asWebviewUri(Uri.joinPath(this.context.extensionUri, 'media', 'main.js'));
    const stylesMainUri = webview.asWebviewUri(Uri.joinPath(this.context.extensionUri, 'media', 'main.css'));

    const vendorHighlightCss = webview.asWebviewUri(Uri.joinPath(this.context.extensionUri, 'media', 'vendor', 'highlight.min.css'));
    const vendorHighlightJs = webview.asWebviewUri(Uri.joinPath(this.context.extensionUri, 'media', 'vendor', 'highlight.min.js'));
    const vendorMarkedJs = webview.asWebviewUri(Uri.joinPath(this.context.extensionUri, 'media', 'vendor', 'marked.min.js'));
    const vendorTailwindJs = webview.asWebviewUri(Uri.joinPath(this.context.extensionUri, 'media', 'vendor', 'tailwindcss.3.2.4.min.js'));
    const toolkitUri = webview.asWebviewUri(Uri.joinPath(this.context.extensionUri, "media", "vendor", "toolkit.js"));
    const iconUri = webview.asWebviewUri(Uri.joinPath(this.context.extensionUri, 'media', 'MeterialSymbols', 'meterialSymbols.css'));

    let welcomMsg = "";
    const activeEngine = configuration.getActiveEngineInfo();
    let key = activeEngine.key || await configuration.getApiKey(activeEngine.label);
    let username: string | undefined = await configuration.username(activeEngine.label);
    if (!username && key) {
      username = l10n.t("{0} User", activeEngine.label);
    }
    let category = "welcome";
    welcomMsg = l10n.t("Welcome<b>{0}</b>, I'm <b>{1}</b>, your code assistant. You can ask me any technical question, or ask me to help you with your code.", `${username ? ` @${username}` : ""}`, l10n.t("SenseCode"));
    if (!username) {
      category = "no-account";
      let settingsUri = Uri.parse(`command:sensecode.settings`);
      welcomMsg += "<br/><br/>" + l10n.t("It seems that you have not had an account to <b>{0}</b>, set it in <vscode-link href=\"{1}\">setting page</vscode-link>.", activeEngine.label, `${settingsUri}`);
    } else {
      welcomMsg += guide;
    }
    let codeEmpty = this.lastTextEditor?.selection?.isEmpty;
    return `<!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">

                <link href="${stylesMainUri}" rel="stylesheet">
                <link href="${vendorHighlightCss}" rel="stylesheet">
                <link href="${iconUri}" rel="stylesheet" />
                <script src="${vendorHighlightJs}"></script>
                <script src="${vendorMarkedJs}"></script>
                <script src="${vendorTailwindJs}"></script>
                <script type="module" src="${toolkitUri}"></script>
            </head>
            <body class="overflow-hidden">
                <div id="setting-page"></div>
                <div class="flex flex-col h-screen" id="qa-list-wrapper">
                  <div class="flex flex-col flex-1 overflow-y-auto" id="qa-list">
                    <div class="p-4 w-full message-element-gnc markdown-body ${category}">
                      <h2 class="avatar font-bold mt-1 mb-4 flex flex-row-reverse text-xl gap-1"><span class="material-symbols-rounded">assistant</span> ${l10n.t("SenseCode")}</h2>
                      <div id="welcome">
                        ${welcomMsg}
                      </div>
                    </div>
                  </div>
                    <div id="error-wrapper"></div>
                    <div id="chat-button-wrapper" class="w-full flex flex-col justify-center items-center p-1 gap-1">
                      <div id="ask-list" class="flex flex-col hidden"></div>
                      <div id="question" class="${codeEmpty ? "" : "code-ready"} w-full flex justify-center items-center">
                        <label id="question-sizer" data-value
                          data-placeholder="${l10n.t("Ask SenseCode a question") + ", " + l10n.t("or type '/' for prompts")}"
                          data-hint="${l10n.t("Pick one prompt to send [Enter]")}"
                          data-placeholder-short="${l10n.t("Ask SenseCode a question")}"
                          >
                          <textarea id="question-input" oninput="this.parentNode.dataset.value = this.value" rows="1"></textarea>
                        </label>
                        <button id="send-button" title="${l10n.t("Send [Ctrl+Enter]")}">
                            <span class="material-symbols-rounded">send</span>
                        </button>
                        <button id="stop-button" title="${l10n.t("Stop [Esc]")}">
                            <span class="material-symbols-rounded">stop</span>
                        </button>
                      </div>
                    </div>
                </div>
                <script>
                  const l10nForUI = {
                    "Question": "${l10n.t("Question")}",
                    "SenseCode": "${l10n.t("SenseCode")}",
                    "Cancel": "${l10n.t("Cancel [Esc]")}",
                    "Send": "${l10n.t("Send this prompt [Ctrl+Enter]")}",
                    "ToggleWrap": "${l10n.t("Toggle line wrap")}",
                    "Copy": "${l10n.t("Copy to clipboard")}",
                    "Insert": "${l10n.t("Insert the below code at cursor")}",
                    "Thinking...": "${l10n.t("Thinking...")}",
                    "Connecting...": "${l10n.t("Connecting...")}",
                    "Typing...": "${l10n.t("Typing...")}",
                    "Stop responding": "${l10n.t("Stop responding")}",
                    "Regenerate": "${l10n.t("Regenerate")}",
                    "Empty prompt": "${l10n.t("Empty prompt")}"
                  };
                </script>
                <script src="${scriptUri}"></script>
            </body>
            </html>`;
  }
}

export class SenseCodeViewProvider implements WebviewViewProvider {
  private static eidtor?: SenseCodeEditor;
  constructor(private context: ExtensionContext) {
    context.subscriptions.push(
      commands.registerCommand("sensecode.settings", () => {
        configuration.update();
        return SenseCodeViewProvider.eidtor?.updateSettingPage("toogle");
      })
    );
  }

  public resolveWebviewView(
    webviewView: WebviewView,
    _context: WebviewViewResolveContext,
    _token: CancellationToken,
  ) {
    SenseCodeViewProvider.eidtor = new SenseCodeEditor(this.context, webviewView.webview);
  }

  public static async ask(prompt: Prompt, code: string, lang?: string) {
    commands.executeCommand('sensecode.view.focus');
    while (!SenseCodeViewProvider.eidtor) {
      await new Promise((f) => setTimeout(f, 1000));
    }
    return SenseCodeViewProvider.eidtor?.sendApiRequest(prompt, code, lang);
  }
}
