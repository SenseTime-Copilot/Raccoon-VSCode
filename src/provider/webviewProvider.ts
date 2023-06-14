import { window, workspace, WebviewViewProvider, TabInputText, TabInputNotebook, WebviewView, ExtensionContext, WebviewViewResolveContext, CancellationToken, Range, SnippetString, commands, Webview, Uri, l10n, ViewColumn, env, ProgressLocation, TextEditor, Disposable, OverviewRulerLane, ThemeColor, TextDocument } from 'vscode';
import { configuration, outlog, telemetryReporter } from '../extension';
import { Prompt } from './sensecodeManager';
import { getDocumentLanguage } from '../utils/getDocumentLanguage';
import { SenseCodeEidtorProvider } from './assitantEditorProvider';
import { swords } from '../utils/swords';

const guide = `
      <h3>${l10n.t("Coding with SenseCode")}</h3>
      <ol>
      <li>
        ${l10n.t("Stop typing or press hotkey (default: <code>Alt+/</code>) to starts SenseCode thinking")}:
        <code style="display: flex; padding: 0.5rem; margin: 0.5rem; background-color: var(--vscode-editor-background); border: 1px solid var(--vscode-editor-lineHighlightBorder); border-radius: 0.25rem; line-height: 1.2;">
          <span style="color: var(--vscode-symbolIcon-functionForeground);">print</span>
          <span style="border-left: 2px solid var(--vscode-editorCursor-foreground);animation: pulse 1s step-start infinite;" class="animate-pulse"></span>
          <span style="color: var(--foreground); opacity: 0.4;">("hello world");</span>
        </code>
      </li>
      <li>
      ${l10n.t("When multi candidates generated, use <code>Alt+[</code> or <code>Alt+]</code> to switch between them")}:
        <code style="display: flex; padding: 0.5rem; margin: 0.5rem; background-color: var(--vscode-editor-background); border: 1px solid var(--vscode-editor-lineHighlightBorder); border-radius: 0.25rem; line-height: 1.2;">
          <span style="color: var(--vscode-symbolIcon-functionForeground);">print</span>
          <span style="border-left: 2px solid var(--vscode-editorCursor-foreground);animation: pulse 1s step-start infinite;" class="animate-pulse"></span>
          <span style="color: var(--foreground); opacity: 0.4;">("hello", "world");</span>
        </code>
      </li>
      <li>
      ${l10n.t("Accepct the chosen code snippet with <code>Tab</code> key")}:
        <code style="display: flex; padding: 0.5rem; margin: 0.5rem; background-color: var(--vscode-editor-background); border: 1px solid var(--vscode-editor-lineHighlightBorder); border-radius: 0.25rem; line-height: 1.2;">
          <span style="color: var(--vscode-symbolIcon-functionForeground);">print</span>
          <span style="color: var(--vscode-symbolIcon-colorForeground);">(</span>
          <span style="color: var(--vscode-symbolIcon-enumeratorForeground);">"hello"</span>
          <span style="color: var(--vscode-symbolIcon-colorForeground);">, </span>
          <span style="color: var(--vscode-symbolIcon-enumeratorForeground);">"world"</span>
          <span style="color: var(--vscode-symbolIcon-colorForeground);">);</span>
        </code>
      </li>
      </ol>
      <h3>${l10n.t("Ask SenseCode")}</h3>
      <ol>
      <li>
      ${l10n.t("Select code in editor")}:
        <code style="display: flex; padding: 0.1rem; margin: 0.5rem; background-color: var(--vscode-editor-background); border: 1px solid var(--vscode-editor-lineHighlightBorder); border-radius: 0.25rem; line-height: 1.2;">
        <div class="flex" style="display: flex; padding: 0.2rem; margin: 0.3rem; width: fit-content;background-color: var(--vscode-editor-selectionBackground);">
          <span style="color: var(--vscode-symbolIcon-functionForeground);">print</span>
          <span style="color: var(--vscode-symbolIcon-colorForeground);">(</span>
          <span style="color: var(--vscode-symbolIcon-enumeratorForeground);">"hello"</span>
          <span style="color: var(--vscode-symbolIcon-colorForeground);">, </span>
          <span style="color: var(--vscode-symbolIcon-enumeratorForeground);">"world"</span>
          <span style="color: var(--vscode-symbolIcon-colorForeground);">);</span>
        </div>
        </code>
      </li>
      <li>
      ${l10n.t("Select prompt/write your question in input box at bottom, complete the prompt (if necessary), click send button (or press <code>Enter</code>) to ask SenseCode")}:
          <a onclick="document.getElementById('question-input').focus();document.getElementById('question').classList.remove('flash');void document.getElementById('question').offsetHeight;document.getElementById('question').classList.add('flash');" style="text-decoration: none;cursor: pointer;">
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
      <div class="flex items-center gap-2 m-2 p-2 leading-loose rounded" style="background-color: var(--vscode-editorCommentsWidget-rangeActiveBackground);">
      <span class="material-symbols-rounded">question_mark</span>
      <div class="inline-block leading-loose">${l10n.t("Read SenseCode document for more information")}</div>
      <div class="flex grow justify-end">
        <vscode-link href="vscode:extension/sensetime.sensecode"><span class="material-symbols-rounded">keyboard_double_arrow_right</span></vscode-link>
      </div>
      </div>
      `;

const loginHint = `<div class="flex items-center gap-2 m-2 p-2 leading-loose rounded" style="background-color: var(--vscode-editorCommentsWidget-rangeActiveBackground);">
            <span class='material-symbols-rounded'>priority_high</span>
            <div class='inline-block leading-loose'>
              ${l10n.t("It seems that you have not had an account to <b>{0}</b>, please <b>login</b> or <b>set API Key</b> in settings first.", l10n.t("SenseCode"))}
            </div>
            <div class="flex grow justify-end">
              <vscode-link href="${Uri.parse(`command:sensecode.settings`)}"><span class="material-symbols-rounded">settings</span></vscode-link>
            </div>
          </div>`;

export class SenseCodeEditor extends Disposable {
  private stopList: { [key: number]: AbortController };
  private lastTextEditor?: TextEditor;
  private disposing = false;
  private static bannedWords: string[] = [];
  private static insertDecorationType = window.createTextEditorDecorationType({
    backgroundColor: new ThemeColor("diffEditor.insertedLineBackground"),
    isWholeLine: true,
    overviewRulerColor: new ThemeColor("minimapGutter.addedBackground"),
    overviewRulerLane: OverviewRulerLane.Full,
    after: {
      contentText: "⁣⁣⁣⁣　SenseCode⁣⁣⁣⁣　",
      backgroundColor: new ThemeColor("activityBarBadge.background"),
      color: new ThemeColor("activityBarBadge.foreground"),
      borderColor: new ThemeColor("activityBar.activeBorder")
    }
  });

  private isSupportedScheme(d: TextDocument) {
    return (d.uri.scheme === "file" || d.uri.scheme === "git" || d.uri.scheme === "untitled" || d.uri.scheme === "vscode-userdata");
  }

  constructor(private context: ExtensionContext, private webview: Webview) {
    super(() => { });
    if (SenseCodeEditor.bannedWords.length === 0) {
      for (let w of swords) {
        SenseCodeEditor.bannedWords.push(decodeURIComponent(escape(atob(w))).trim());
      }
    }
    this.stopList = {};
    this.lastTextEditor = window.activeTextEditor;
    context.subscriptions.push(
      workspace.onDidChangeConfiguration(async (e) => {
        if (e.affectsConfiguration("SenseCode")) {
          configuration.update();
          if (e.affectsConfiguration("SenseCode.Prompt")) {
            this.sendMessage({ type: 'promptList', value: configuration.prompt });
          }
          if (e.affectsConfiguration("SenseCode.Engines")) {
            await configuration.updateEngineList();
            this.updateSettingPage("full");
          }
        }
      })
    );
    context.subscriptions.push(
      context.secrets.onDidChange((e) => {
        if (e.key === "SenseCode.tokens") {
          this.showWelcome();
        }
      })
    );
    context.subscriptions.push(
      window.onDidChangeActiveTextEditor((e) => {
        let doc: TextDocument | undefined = undefined;
        if (e) {
          doc = e.document;
        } else {
          let docs = workspace.textDocuments;
          for (let d of docs) {
            if (this.isSupportedScheme(d)) {
              return;
            }
          }
        }
        if (!doc) {
          this.lastTextEditor = undefined;
          this.sendMessage({ type: 'codeReady', value: false });
        } else if (this.isSupportedScheme(doc)) {
          this.lastTextEditor = e;
        }
      })
    );
    context.subscriptions.push(
      workspace.onDidCloseTextDocument((e) => {
        if (this.lastTextEditor) {
          if (this.lastTextEditor.document.uri.path === e.uri.path) {
            this.lastTextEditor = undefined;
            this.sendMessage({ type: 'codeReady', value: false });
          }
        }
      })
    );
    context.subscriptions.push(
      window.onDidChangeTextEditorSelection(e => {
        if (this.isSupportedScheme(e.textEditor.document)) {
          if (e.selections[0]) {
            let text = e.textEditor.document.getText(e.selections[0]);
            if (text.trim()) {
              this.sendMessage({ type: 'codeReady', value: true });
              return;
            }
          }
          this.sendMessage({ type: 'codeReady', value: false });
        }
      })
    );
    this.showPage();
  }

  private showWelcome(full?: boolean) {
    configuration.update();
    this.sendMessage({ type: 'updateSettingPage', action: "close" });
    let detail = full ? guide : '';
    configuration.username().then(async (username) => {
      let category = "welcome";
      if (username) {
        username = ` @${username}`;
      } else {
        category = "no-account";
        username = "";
        detail += loginHint;
      }
      let welcomMsg = l10n.t("Welcome<b>{0}</b>, I'm <b>{1}</b>, your code assistant. You can ask me to help you with your code, or ask me any technical question.", username, l10n.t("SenseCode"));
      this.sendMessage({ type: 'addMessage', category, username, value: welcomMsg + detail });
    });
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
    let setPromptUri = Uri.parse(`command:workbench.action.openGlobalSettings?${encodeURIComponent(JSON.stringify({ query: "SenseCode.Prompt" }))}`);
    let setEngineUri = Uri.parse(`command:workbench.action.openGlobalSettings?${encodeURIComponent(JSON.stringify({ query: "SenseCode.Engines" }))}`);
    let esList = `<vscode-dropdown id="engineDropdown" class="w-full" value="${configuration.getActiveClientLabel()}">`;
    let es = configuration.clientsLabel;
    for (let label of es) {
      esList += `<vscode-option value="${label}">${label}</vscode-option>`;

    }
    esList += "</vscode-dropdown>";
    let username: string | undefined = await configuration.username();
    let avatarEle = `<span class="material-symbols-rounded" style="font-size: 40px; font-variation-settings: 'opsz' 48;">person_pin</span>`;
    let loginout = ``;
    if (!username) {
      let authUrl = configuration.getAuthUrlLogin(env.machineId);
      let url = Uri.parse(authUrl || "");
      loginout = `<vscode-link class="justify-end" title="${l10n.t("Login")} [${url.authority}]" href="${url.toString(true)}">
                      <span class="material-symbols-rounded">login</span>
                    </vscode-link>`;

    } else {
      let avatar = await configuration.avatar();
      if (avatar) {
        avatarEle = `<img class="w-10 h-10 rounded-full" src="${avatar}" />`;
      }
      loginout = `<vscode-link class="justify-end" title="${l10n.t("Logout")}">
                    <span id="clearKey" class="material-symbols-rounded">logout</span>
                  </vscode-link>`;
    }
    let accountInfo = `
        <div class="flex gap-2 items-center w-full">
          ${avatarEle}
          <span class="grow capitalize font-bold text-base">${username || l10n.t("Unknown")}</span>
          ${loginout}
        </div>
        `;

    let settingPage = `
    <div id="settings" class="h-screen select-none flex flex-col gap-2 mx-auto p-4 max-w-sm">
      <div class="immutable fixed top-3 right-4">
        <span class="cursor-pointer material-symbols-rounded" onclick="document.getElementById('settings').remove();document.getElementById('question-input').focus();">close</span>
      </div>
      <div class="immutable flex flex-col mt-4 px-2 gap-2">
        <div class="flex flex-row gap-2 items-center justify-between">
          ${accountInfo}
        </div>
      </div>
      <vscode-divider class="${es.length === 1 ? "hidden" : ""}" style="border-top: calc(var(--border-width) * 1px) solid var(--panel-view-border);"></vscode-divider>
      <b class="${es.length === 1 ? "hidden" : ""}">${l10n.t("Service")}</b>
      <div class="flex flex-col ml-4 my-2 px-2 gap-2 ${es.length === 1 ? "hidden" : ""}">
        <span>${l10n.t("Code engine")}</span>
        <div class="flex flex-row">
          <span class="material-symbols-rounded attach-btn-left" style="padding: 3px;" title="${l10n.t("Code engine")}">assistant</span>
          ${esList}
          <vscode-link href="${setEngineUri}" class="pt-px attach-btn-right" title="${l10n.t("Settings")}">
            <span class="material-symbols-rounded">tune</span>
          </vscode-link>
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
          <label slot="label">${l10n.t("Show response")}</label>
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
        case 'welcome': {
          this.showWelcome(true);
          break;
        }
        case 'listPrompt': {
          this.sendMessage({ type: 'promptList', value: configuration.prompt });
          break;
        }
        case 'searchQuery': {
          this.sendMessage({ type: 'addSearch', value: '?' + data.query });
          for (let url of data.searchUrl) {
            let q = url.replace('${query}', encodeURIComponent(data.query));
            commands.executeCommand("vscode.open", q);
          }
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
              if (editor.document.languageId !== "plaintext") {
                lang = editor.document.languageId;
              }
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
                  let content: string = data.value;
                  let start = this.lastTextEditor?.selection.start.line;
                  this.lastTextEditor?.insertSnippet(new SnippetString(content.trimEnd() + "\n")).then(async (_v) => {
                    await new Promise((f) => setTimeout(f, 200));
                    let end = this.lastTextEditor?.selection.anchor.line;
                    if (start !== undefined && end !== undefined) {
                      let remover = workspace.onDidChangeTextDocument((e) => {
                        if (e.document.uri.path === this.lastTextEditor?.document.uri.path) {
                          this.lastTextEditor?.setDecorations(SenseCodeEditor.insertDecorationType, []);
                        }
                      });
                      this.lastTextEditor?.setDecorations(SenseCodeEditor.insertDecorationType, [{
                        range: new Range(start, 0, end, 0)
                      }]);
                      setTimeout(() => {
                        remover.dispose();
                        this.lastTextEditor?.setDecorations(SenseCodeEditor.insertDecorationType, []);
                      }, 5000);
                    }
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
          configuration.setActiveClient(data.value);
          this.updateSettingPage("full");
          break;
        }
        case 'clearKey': {
          let ae = configuration.getActiveClientLabel();
          window.showWarningMessage(
            l10n.t("Logout & clear API Key for {0} from Secret Storage?", ae),
            { modal: true },
            l10n.t("OK"))
            .then((v) => {
              if (v === l10n.t("OK")) {
                configuration.logout();
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

  public async sendApiRequest(prompt: Prompt, code: string, lang: string) {
    if (prompt.type === "focus") {
      await new Promise((f) => setTimeout(f, 300));
      this.sendMessage({ type: 'focus' });
      return;
    }
    let ts = new Date();
    let id = ts.valueOf();
    let timestamp = ts.toLocaleString();

    let send = true;
    let requireCode = true;
    let streaming = configuration.streamResponse;
    let instruction = prompt.prompt;
    for (let sw of SenseCodeEditor.bannedWords) {
      if (instruction.includes(sw) || code.includes(sw)) {
        this.sendMessage({ type: 'showError', category: 'illegal-instruction', value: l10n.t("Incomprehensible Question"), id });
        return;
      }
    }

    if (instruction.includes("${input")) {
      send = false;
    }
    if (prompt.type === "free chat" || (prompt.type === "custom" && !instruction.includes("${code}"))) {
      requireCode = false;
    }

    let promptClone = { ...prompt };
    promptClone.prompt = instruction.replace("${code}", "");

    try {
      let loggedin = await configuration.isClientLoggedin();
      if (!loggedin) {
        //this.sendMessage({ type: 'addMessage', category: "no-account", value: loginHint });
        this.sendMessage({ type: 'showError', category: 'key-not-set', value: l10n.t("API Key not set"), id });
        return;
      }

      if (requireCode && !code) {
        this.sendMessage({ type: 'showError', category: 'no-code', value: l10n.t("No code selected"), id });
        return;
      } else {
        if (code.length > configuration.tokenForPrompt() * 3) {
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

      let username = await configuration.username();
      let avatar = await configuration.avatar();
      this.sendMessage({ type: 'addQuestion', username, avatar: avatar || undefined, value: promptClone, code, lang, send, id, streaming, timestamp });
      if (!send) {
        return;
      }

      let promptMsg = `Below is an instruction that describes a task. Write a response that appropriately completes the request.

### Instruction:
${l10n.t("Answer this question")}: ${instructionMsg}

### Input:
${codeStr}

### Response:\n`;

      this.stopList[id] = new AbortController();
      if (streaming) {
        configuration.getCompletionsStreaming(
          promptMsg,
          1,
          configuration.maxToken(),
          undefined,
          this.stopList[id].signal
        ).then((data) => {
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
        }).catch(e => {
          this.sendMessage({ type: 'addError', error: e.message, id });
        });
      } else {
        let rs: any = await configuration.getCompletions(promptMsg, 1, configuration.maxToken(), undefined, this.stopList[id].signal);
        let content = rs?.choices[0]?.text || "";
        outlog.debug(content);
        this.sendMessage({ type: 'addResponse', id, value: content });
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

  public async clear() {
    this.sendMessage({ type: "clear" });
    this.showWelcome(true);
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
    const avatarUri = webview.asWebviewUri(Uri.joinPath(this.context.extensionUri, 'media', 'sensecode-logo.png'));

    let codeReady = this.lastTextEditor?.selection?.isEmpty === false;
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
                <style>
                .sensecode-avatar {
                  background-image: url("${avatarUri}");
                  -webkit-mask: url("${avatarUri}");
                  -webkit-mask-size: contain;
                }
                </style>
            </head>
            <body class="overflow-hidden">
              <div id="setting-page"></div>
              <div class="flex flex-col h-screen" id="qa-list-wrapper">
                <vscode-panels class="grow">
                  <vscode-panel-view id="view-1" class="p-0 m-0">
                    <div class="flex flex-col flex-1 overflow-y-auto" id="qa-list">
                      <vscode-progress-ring class="progress-ring w-full content-center mt-32"></vscode-progress-ring>
                    </div>
                  </vscode-panel-view>
                </vscode-panels>
                <div id="error-wrapper">
                </div>
                <div id="chat-button-wrapper" class="w-full flex flex-col justify-center items-center p-1 gap-1">
                  <div id="search-list" class="flex flex-col w-full py-2 hidden">
                    <vscode-checkbox class="px-2 py-1 m-0" checked title='Search in StackOverflow w/ DuckDuckGo' data-query='https://duckduckgo.com/?q=site%3Astackoverflow.com+\${query}'>
                      StackOverflow [DuckDuckGo]
                    </vscode-checkbox>
                    <vscode-checkbox class="px-2 py-1 m-0" title='Search in Quora' data-query='https://www.quora.com/search?q=\${query}'>
                      Quora
                    </vscode-checkbox>
                    <vscode-checkbox class="px-2 py-1 m-0" title='Search in Zhihu' data-query='https://www.zhihu.com/search?q=\${query}'>
                      Zhihu
                    </vscode-checkbox>
                    <vscode-checkbox class="px-2 py-1 m-0" title='Search in C++ Reference w/ DuckDuckGo' data-query='https://duckduckgo.com/?q=site%3Adocs.python.org+\${query}'>
                      Python Reference [DuckDuckGo]
                    </vscode-checkbox>
                    <vscode-checkbox class="px-2 py-1 m-0" title='Search in C++ Reference w/ DuckDuckGo' data-query='https://duckduckgo.com/?q=site%3Acppreference.com+\${query}'>
                      C++ Reference [DuckDuckGo]
                    </vscode-checkbox>
                    <vscode-checkbox class="px-2 py-1 m-0" title='Search in MDN Web Docs' data-query='https://developer.mozilla.org/zh-CN/search?q=\${query}'>
                      MDN Web Docs
                    </vscode-checkbox>
                  </div>
                  <div id="ask-list" class="flex flex-col hidden">
                  </div>
                  <div id="question" class="${codeReady ? "code-ready" : ""} w-full flex justify-center items-center">
                    <span class="material-symbols-rounded opacity-40 history-icon">
                      history
                    </span>
                    <label id="question-sizer" data-value
                          data-placeholder="${l10n.t("Ask SenseCode a question") + ", " + l10n.t("or type '/' for prompts")}"
                          data-hint="${l10n.t("Pick one prompt to send [Enter]")}"
                          data-placeholder-short="${l10n.t("Ask SenseCode a question")}"
                    >
                      <textarea id="question-input" oninput="this.parentNode.dataset.value = this.value" rows="1"></textarea>
                    </label>
                    <button id="send-button" title="${l10n.t("Send [Enter]")}">
                      <span class="material-symbols-rounded">send</span>
                    </button>
                    <button id="stop-button" title="${l10n.t("Stop [Esc]")}">
                      <span class="material-symbols-rounded">stop</span>
                    </button>
                    <button id="search-button" title="${l10n.t("Search [Enter]")}">
                      <span class="material-symbols-rounded">search</span>
                    </button>
                  </div>
                </div>
              </div>
              <script>
                const l10nForUI = {
                  "Question": "${l10n.t("Question")}",
                  "SenseCode": "${l10n.t("SenseCode")}",
                  "Cancel": "${l10n.t("Cancel [Esc]")}",
                  "Delete": "${l10n.t("Delete this chat entity")}",
                  "Send": "${l10n.t("Send [Enter]")}",
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
      commands.registerCommand("sensecode.settings", async () => {
        configuration.update();
        commands.executeCommand('sensecode.view.focus').then(() => {
          return SenseCodeViewProvider.eidtor?.updateSettingPage("toogle");
        });
      })
    );
    context.subscriptions.push(
      commands.registerCommand("sensecode.clear", async (uri) => {
        if (!uri) {
          SenseCodeViewProvider.eidtor?.clear();
        } else {
          let editor = SenseCodeEidtorProvider.getEditor(uri);
          editor?.clear();
        }
      })
    );
  }

  public resolveWebviewView(
    webviewView: WebviewView,
    _context: WebviewViewResolveContext,
    _token: CancellationToken,
  ) {
    SenseCodeViewProvider.eidtor = new SenseCodeEditor(this.context, webviewView.webview);
    webviewView.onDidChangeVisibility(() => {
      if (!webviewView.visible) {
        SenseCodeViewProvider.eidtor?.sendMessage({ type: 'updateSettingPage', action: "close" });
      }
    });
    webviewView.onDidDispose(() => {
      SenseCodeViewProvider.eidtor?.sendMessage({ type: 'updateSettingPage', action: "close" });
    });
  }

  public static async ask(prompt: Prompt, code: string, lang: string) {
    commands.executeCommand('sensecode.view.focus');
    while (!SenseCodeViewProvider.eidtor) {
      await new Promise((f) => setTimeout(f, 1000));
    }
    return SenseCodeViewProvider.eidtor?.sendApiRequest(prompt, code, lang);
  }
}
