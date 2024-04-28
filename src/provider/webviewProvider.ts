import { window, workspace, WebviewViewProvider, TabInputText, TabInputNotebook, WebviewView, ExtensionContext, WebviewViewResolveContext, CancellationToken, commands, Webview, Uri, l10n, env, TextEditor, Disposable, TextDocument, TextEditorEdit } from 'vscode';
import { raccoonManager, outlog, telemetryReporter, extensionNameKebab, extensionNameCamel, raccoonSearchEditorProviderViewType, favoriteCodeEditorViewType, raccoonConfig, registerCommand } from "../globalEnv";
import { PromptInfo, PromptType, RenderStatus, RaccoonPrompt } from "./promptTemplates";
import { RaccoonEditorProvider } from './assitantEditorProvider';
import { CompletionPreferenceType } from './raccoonManager';
import { Choice, FinishReason, Message, MetricType, Role } from '../raccoonClient/CodeClient';
import { buildHeader } from '../utils/buildRequestHeader';
import { diffCode } from './diffContentProvider';
import { HistoryCache, CacheItem, CacheItemType } from '../utils/historyCache';
import { FavoriteCodeEditor } from './favoriteCode';
import { ModelCapacity } from './config';
import { phoneZoneCode } from '../utils/phoneZoneCode';

interface TelemetryInfo {
  id: number;
  ts: number;
  action: string;
  languageid: string;
}

function makeGuide(isMac: boolean) {
  return `
  <h3>${l10n.t("Coding with Raccoon")}</h3>
  <ol>
  <li>
    ${l10n.t("Stop typing or press hotkey (default: <code>{0}</code>) to starts Raccoon thinking", isMac ? "⌥/" : "Alt+/")}:
    <code style="display: flex; padding: 0.5rem; margin: 0.5rem; background-color: var(--vscode-editor-background); border: 1px solid var(--vscode-editor-lineHighlightBorder); border-radius: 0.25rem; line-height: 1.2;">
      <span style="color: var(--vscode-symbolIcon-functionForeground);">print</span>
      <span style="border-left: 2px solid var(--vscode-editorCursor-foreground);animation: pulse 1s step-start infinite;" class="animate-pulse"></span>
      <span style="color: var(--foreground); opacity: 0.4;">("hello world");</span>
    </code>
  </li>
  <li>
  ${l10n.t("When multi candidates generated, use <code>{0}</code> or <code>{1}</code> to switch between them", isMac ? "⌥[" : "Alt+[", isMac ? "⌥]" : "Alt+]")}:
    <code style="display: flex; padding: 0.5rem; margin: 0.5rem; background-color: var(--vscode-editor-background); border: 1px solid var(--vscode-editor-lineHighlightBorder); border-radius: 0.25rem; line-height: 1.2;">
      <span style="color: var(--vscode-symbolIcon-functionForeground);">print</span>
      <span style="border-left: 2px solid var(--vscode-editorCursor-foreground);animation: pulse 1s step-start infinite;" class="animate-pulse"></span>
      <span style="color: var(--foreground); opacity: 0.4;">("hello", "world");</span>
    </code>
  </li>
  <li>
  ${l10n.t("Accept the chosen code snippet with <code>Tab</code> key")}:
    <code style="display: flex; padding: 0.5rem; margin: 0.5rem; background-color: var(--vscode-editor-background); border: 1px solid var(--vscode-editor-lineHighlightBorder); border-radius: 0.25rem; line-height: 1.2;">
      <span style="color: var(--vscode-symbolIcon-functionForeground);">print</span>
      <span style="color: var(--vscode-symbolIcon-colorForeground);">(</span>
      <span style="color: var(--vscode-symbolIcon-enumeratorForeground);">"hello"</span>
      <span style="color: var(--vscode-symbolIcon-colorForeground);">, </span>
      <span style="color: var(--vscode-symbolIcon-enumeratorForeground);">"world"</span>
      <span style="color: var(--vscode-symbolIcon-colorForeground);">);</span>
    </code>
  </li>
  <li>
  ${l10n.t("Or, accept signle word by <code>Ctrl+→</code>, accept single line by <code>Ctrl+↓</code>")}:
  </li>
  </ol>
  <h3>${l10n.t("Ask Raccoon")}</h3>
  <ol>
  <li>
  ${l10n.t("Select code in editor (if necessary)")}:
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
  ${l10n.t("Select prompt (by typing <code>/</code>)/write your question in input box at bottom, complete the prompt (if necessary), click send button (or press <code>Enter</code>) to ask Raccoon")}:
      <a onclick="document.getElementById('question-input').focus();document.getElementById('question').classList.remove('flash');void document.getElementById('question').offsetHeight;document.getElementById('question').classList.add('flash');" style="text-decoration: none;cursor: pointer;">
        <div class="flex p-1 px-2 m-2 text-xs flex-row-reverse" style="border: 1px solid var(--panel-view-border);background-color: var(--input-background);"><span style="color: var(--input-placeholder-foreground);" class="material-symbols-rounded">send</span></div>
      </a>
  </li>
  <li>
  ${l10n.t("Or, select prompt without leaving the editor by pressing hotkey (default: <code>{0}</code>)", isMac ? "⌥/" : "Alt+/")}:
        <div class="flex flex-col m-2 text-xs" style="border: 1px solid var(--vscode-editorSuggestWidget-border);background-color: var(--vscode-editorSuggestWidget-background);">
        <div class="flex py-1 pl-2 gap-2"><span style="color: var(--vscode-editorLightBulb-foreground);" class="material-symbols-rounded">lightbulb</span><span style="background-color: var(--progress-background);opacity: 0.3;width: 70%;"></span></div>
        <div class="flex py-1 pl-2 gap-2"><span style="color: var(--vscode-editorLightBulb-foreground);" class="material-symbols-rounded">lightbulb</span><span style="background-color: var(--progress-background);opacity: 0.3;width: 50%;" class="animate-pulse"></span></div>
        <div class="flex py-1 pl-2 gap-2"><span style="color: var(--vscode-editorLightBulb-foreground);" class="material-symbols-rounded">lightbulb</span><span style="background-color: var(--progress-background);opacity: 0.3;width: 60%;"></span></div>
  </li>
  </ol>
  `;
}

export class RaccoonEditor extends Disposable {
  private stopList: { [key: number]: AbortController };
  private lastTextEditor?: TextEditor;
  private cache: HistoryCache;

  private isSupportedScheme(d: TextDocument) {
    return (d.uri.scheme === "file" || d.uri.scheme === "git" || d.uri.scheme === "untitled" || d.uri.scheme === "vscode-notebook-cell" || d.uri.scheme === "vscode-userdata" || d.uri.scheme === "vscode-remote");
  }

  constructor(private readonly context: ExtensionContext, private webview: Webview) {
    super(() => { });
    this.cache = new HistoryCache(context, `${env.sessionId}-${new Date().valueOf()}`);
    this.stopList = {};
    this.lastTextEditor = window.activeTextEditor;
    raccoonManager.onDidChangeStatus(async (e) => {
      if (e.scope.includes("authorization") && !e.quiet) {
        this.showWelcome();
      } else if (e.scope.includes("agent")) {
        let value = Array.from(raccoonManager.agent.values());
        this.sendMessage({ type: 'agentList', value });
      } else if (e.scope.includes("prompt")) {
        this.sendMessage({ type: 'promptList', value: raccoonManager.prompt });
      } else if (e.scope.includes("engines")) {
        this.updateSettingPage("full");
      } else if (e.scope.includes("active")) {
        this.updateSettingPage("full");
        this.showWelcome(true);
      } else if (e.scope.includes("config")) {
        this.updateSettingPage();
      }
    });
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
          if (e && this.checkCodeReady(e)) {
            let content = doc.getText(e.selections[0]);
            let lang = doc.languageId;
            this.sendMessage({ type: 'codeReady', value: true, file: e.document.uri.toString(), range: e.selections[0], lang, content });
          } else {
            this.sendMessage({ type: 'codeReady', value: false });
          }
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
            let doc = e.textEditor.document;
            let text = doc.getText(e.selections[0]);
            if (text.trim()) {
              let content = doc.getText(e.selections[0]);
              let lang = doc.languageId;
              this.sendMessage({ type: 'codeReady', value: true, file: doc.uri.toString(), range: e.selections[0], lang, content });
              return;
            }
          }
          this.sendMessage({ type: 'codeReady', value: false });
        }
      })
    );
    this.showPage();

    // eslint-disable-next-line @typescript-eslint/naming-convention
    telemetryReporter.logUsage(MetricType.dialog, { dialog_window_usage: { new_session_num: 1 } });
  }

  private buildOrgHint(): string {
    let orgs = raccoonManager.organizationList();
    if (orgs.length === 0) {
      return "";
    }
    return `<a id="switch-org" class="reflink flex items-center gap-2 my-2 p-2 leading-loose rounded" style="background-color: var(--vscode-editorCommentsWidget-rangeActiveBackground);">
            <span class='material-symbols-rounded pointer-events-none'>switch_account</span>
            <div class='inline-block leading-loose pointer-events-none'>${l10n.t("Switch Organization")}</div>
            <span class="material-symbols-rounded grow text-right pointer-events-none">keyboard_double_arrow_right</span>
          </a>`;
  }

  private buildLoginHint() {
    let robot = raccoonManager.getActiveClientRobotName() || "Raccoon";
    return `<a class="reflink flex items-center gap-2 my-2 p-2 leading-loose rounded" style="background-color: var(--vscode-editorCommentsWidget-rangeActiveBackground);" href="command:${extensionNameKebab}.settings">
            <span class='material-symbols-rounded'>person</span>
            <div class='inline-block leading-loose'>${l10n.t("Login to <b>{0}</b>", robot)}</div>
            <span class="material-symbols-rounded grow text-right">keyboard_double_arrow_right</span>
          </a>`;
  }

  private async showWelcome(quiet?: boolean) {
    raccoonManager.update();
    if (!quiet) {
      this.sendMessage({ type: 'updateSettingPage', action: "close" });
    }
    let userinfo = await raccoonManager.userInfo();
    let org = raccoonManager.activeOrganization();
    let ts = new Date();
    let timestamp = ts.toLocaleString();
    let detail = '';
    let name = org?.username || userinfo?.username;
    let category = "welcome";
    let username = '';
    let robot = raccoonManager.getActiveClientRobotName() || "Raccoon";
    if (org) {
      robot += ` (${org.name})`;
    }
    if (name) {
      username = ` @${name}`;
      if (org) {
        username += ` (${org.name})`;
      }
      detail += this.buildOrgHint();
    } else {
      detail += this.buildLoginHint();
    }
    let welcomMsg = l10n.t("Welcome<b>{0}</b>, I'm <b>{1}</b>, your code assistant. You can ask me to help you with your code, or ask me any technical question.", username, robot)
      + `<div style="margin: 0.25rem auto;">${l10n.t("Double-pressing {0} to summon me at any time.", `<kbd ondblclick="document.getElementById('question-input').focus();document.getElementById('question').classList.remove('flash');void document.getElementById('question').offsetHeight;document.getElementById('question').classList.add('flash');">Ctrl</kbd>`)}</div>`
      + detail
      + `<a class="reflink flex items-center gap-2 my-2 p-2 leading-loose rounded" style="background-color: var(--vscode-editorCommentsWidget-rangeActiveBackground);" onclick='vscode.postMessage({type: "sendQuestion", userAgent: navigator.userAgent, prompt: { label: "", type: "help", message: { role: "function", content: "" }}});'>
  <span class="material-symbols-rounded">celebration</span>
  <div class="inline-block leading-loose">${l10n.t("Quick Start")}</div>
  <span class="material-symbols-rounded grow text-right">keyboard_double_arrow_right</span>
</a>`;
    this.sendMessage({ type: 'addMessage', category, quiet, robot, value: welcomMsg, timestamp });
  }

  async loadHistory(history: string) {
    if (history === this.cache.cacheFileId) {
      return;
    }
    return HistoryCache.getCacheItems(this.context, history).then((items?: Array<CacheItem>) => {
      this.clear();
      this.cache = new HistoryCache(this.context, history);
      if (items && items.length > 0) {
        this.sendMessage({ type: 'restoreFromCache', value: items });
      }
    });
  }

  dispose() {
    for (let s in this.stopList) {
      this.stopList[s].abort();
    }
  }

  async updateSettingPage(action?: string): Promise<void> {
    let completionPreference = raccoonManager.completionPreference;
    let streamResponse = raccoonManager.streamResponse;
    let completionDelay = raccoonManager.completionDelay;
    let candidates = raccoonManager.candidates;
    let setEngineUri = Uri.parse(`command:workbench.action.openSettingsJson?${encodeURIComponent(JSON.stringify({ revealSetting: { key: extensionNameCamel + ".Engines" } }))}`);
    let esList = `<vscode-dropdown id="engineDropdown" class="w-full" value="${raccoonManager.getActiveClientRobotName()}">`;
    let es = raccoonManager.robotNames;
    for (let label of es) {
      esList += `<vscode-option value="${label}">${label}</vscode-option>`;
    }
    esList += "</vscode-dropdown>";
    let userId: string | undefined = undefined;
    let username: string | undefined = undefined;
    let avatarEle = `<span class="material-symbols-rounded" style="font-size: 40px;">person_pin</span>`;
    let pro = false;
    let loginForm = ``;
    let logout = ``;
    let accountInfo = ``;
    let emailLogin = raccoonConfig.value("emailLogin");
    if (!raccoonManager.isClientLoggedin()) {
      await raccoonManager.getAuthUrlLogin().then(authUrl => {
        if (!authUrl) {
          return;
        }
        let url = Uri.parse(authUrl);
        let title;
        if (url.scheme === "command" && url.path !== `${extensionNameKebab}.password`) {
          title = l10n.t("Setup Access Key");
        } else {
          title = `${l10n.t("Login")}`;
        }
        loginForm = `<vscode-link title="${title}" href="${url.toString(true)}">
                        <vscode-button>${title}</vscode-button>
                      </vscode-link>`;
        if (url.scheme === "command" && url.path === `${extensionNameKebab}.password`) {
          let accountForm = ``;
          let forgetPwd = ``;
          let tips = ``;
          if (emailLogin) {
            accountForm = `<div class="flex flex-row mx-4">
                                <span class="material-symbols-rounded attach-btn-left" style="padding: 3px; background-color: var(--input-background);">mail</span>
                                <vscode-text-field class="grow" type="email" autofocus id="login-account" required="required">
                                </vscode-text-field>
                              </div>`;
            forgetPwd = `<div tabindex="-1" title="${l10n.t("Forgot Password")}? ${l10n.t("Contact Administrator")}" class="text-xs cursor-pointer">
                              <span class="material-symbols-rounded opacity-50" style="font-variation-settings: 'FILL' 0, 'wght' 300, 'GRAD' 0, 'opsz' 20;">help</span>
                            </div>`;
          } else {
            accountForm = `<div class="flex flex-row mx-4">
                              <span class="material-symbols-rounded attach-btn-left" style="padding: 3px; background-color: var(--dropdown-background);">public</span>
                              <vscode-dropdown class="grow" id="login-code" value="86">
                                ${Object.keys(phoneZoneCode).map((v, _idx, _arr) => `<vscode-option value="${phoneZoneCode[v]}" style="padding: 0 calc(var(--design-unit) * 2px);">${v} (${phoneZoneCode[v]})</vscode-option>`).join('')}
                              </vscode-dropdown>
                            </div>
                            <div class="flex flex-row mx-4">
                              <span class="material-symbols-rounded attach-btn-left" style="padding: 3px; background-color: var(--input-background);">smartphone</span>
                              <vscode-text-field class="grow" type="tel" autofocus pattern="[0-9]{7,11}" maxlength=11 id="login-account" required="required">
                              </vscode-text-field>
                            </div>`;
            forgetPwd = `<div class="grow text-right">
                          <vscode-link tabindex="-1" title="${l10n.t("Forgot Password")}?" class="text-xs" href="${raccoonConfig.value("forgetPassword")}">
                            ${l10n.t("Forgot Password")}?
                          </vscode-link>
                        </div>`;
            tips = `<span class="self-center grow">
                      ${l10n.t("Do not have an account?")}
                      <vscode-link title="${l10n.t("Sign Up")}" class="text-xs mx-1 self-center" href="${raccoonConfig.value("signup")}">
                        ${l10n.t("Sign Up")}
                      </vscode-link>
                    </span>
                    <div class="flex self-center cursor-pointer items-end opacity-50">
                      <span class="material-symbols-rounded">bug_report</span><span id="report-issue">${l10n.t("Report Issue")}</span>
                    </div>`;
          }
          loginForm = `
                    <style>
                    #login.disabled {
                        pointer-events: none;
                        opacity: var(--disabled-opacity);
                    }
                    #login {
                      background-color: var(--button-primary-background);
                      color: var(--button-primary-foreground);
                      padding: 0.4rem 2rem;
                      margin: 1rem;
                      max-width: 32rem;
                    }
                    #login:focus-visible {
                      outline: 1px solid var(--focus-border);
                      background-color: var(--button-primary-hover-background);
                    }
                    vscode-text-field:invalid {
                      --focus-border: var(--vscode-inputValidation-warningBorder);
                    }
                    </style>
                    <vscode-divider style="border-top: calc(var(--border-width) * 1px) solid var(--panel-view-border);"></vscode-divider>
                      <span class="mx-4">${l10n.t("Account")}</span>
                      ${accountForm}
                      <div class="flex flex-col mx-4 my-2">
                      <div class="flex mb-2 items-baseline gap-1">
                        <span>${l10n.t("Password")}</span>
                        ${forgetPwd}
                      </div>
                      <div class="flex flex-row">
                        <span class="material-symbols-rounded attach-btn-left" style="padding: 3px; background-color: var(--input-background);">lock</span>
                        <vscode-text-field type="password" pattern=".{8,32}" maxlength=32 id="login-password" onkeydown="((e) => {if(event.key !== 'Enter') {return;} var account = document.getElementById('login-account');var pwd = document.getElementById('login-password');if(account.validity.valid && pwd.validity.valid){document.getElementById('login').click();};})(this)" class="grow" required="required">
                          <div slot="end" onclick="((e) => {e.children[0].classList.toggle('hidden');e.children[1].classList.toggle('hidden');var pwd = document.getElementById('login-password');if (pwd.type === 'password') {pwd.type = 'text';} else {pwd.type = 'password';}})(this)">
                            <span class="material-symbols-rounded opacity-50 cursor-pointer">visibility_off</span>
                            <span class="material-symbols-rounded opacity-50 cursor-pointer hidden">visibility</span>
                          </div>
                        </vscode-text-field>
                      </div>
                      </div>
                      <button id="login" tabindex="0" class="disabled">${l10n.t("Login")}</button>
                      ${tips}`;
        }
      }, () => { });
    } else {
      let userinfo = await raccoonManager.userInfo();
      userId = userinfo?.userId;
      username = userinfo?.username;
      let avatar = userinfo?.avatar;
      pro = userinfo?.pro || false;
      if (avatar) {
        avatarEle = `<img class="w-10 h-10 rounded-full" src="${avatar}" />`;
      }
      await raccoonManager.getAuthUrlLogin().then(authUrl => {
        if (!authUrl) {
          logout = `<vscode-link title="${l10n.t("Authorized by key from settings")}">
                      <span class="material-symbols-rounded" style="color: var(--foreground);opacity: 0.7;cursor: auto;">password</span>
                    </vscode-link>`;
          return;
        }
        let url = Uri.parse(authUrl);
        let title = l10n.t("Logout");
        let icon = 'logout';
        if (url.scheme === "command" && url.path !== `${extensionNameKebab}.password`) {
          icon = 'key_off';
          title = l10n.t("Clear Access Key");
        }
        logout = `<vscode-link title="${title}">
                      <span id="logout" class="material-symbols-rounded" style="font-size: 24px;">${icon}</span>
                    </vscode-link>`;
      }, () => { });
    }

    let trigger = (completionDelay === 3500) ? "opacity-60" : "";
    let activeOrg = raccoonManager.activeOrganization();
    let knowledgeBaseEnable = pro || activeOrg;

    accountInfo = `
    <div class="flex gap-2 items-center w-full">
      ${avatarEle}
      ${(activeOrg) ? `<div class="grow flex flex-col">
      <span class="font-bold text-base" ${userId ? `title="${activeOrg.username || username} @${userId}"` : ""}>${activeOrg.username || username || l10n.t("Unknown")}</span>
      <div class="flex w-fit opacity-50 rounded-sm gap-1 leading-relaxed items-center px-1 py-px" style="font-size: 9px;color: var(--badge-foreground);background: var(--badge-background);">
        <div class="cursor-pointer" title="${l10n.t("Switch Organization")}"><span id="switch-org" class="material-symbols-rounded">sync_alt</span></div>
        <div class="cursor-pointer" id="switch-org" title="${l10n.t("Managed by {0}", activeOrg.name)}">
          ${activeOrg.name}
        </div>
      </div>
    </div>` : `<div class="grow flex flex-col">
      <div class="flex">
        <span class="font-bold text-base" ${userId ? `title="${username} @${userId}"` : ""}>${username || l10n.t("Unknown")}</span>
        ${pro ? `<span class="material-symbols-rounded self-center opacity-50 mx-1" title="Pro">beenhere</span>` : ""}
      </div>
      <div class="${username ? "flex" : "hidden"} w-fit opacity-50 rounded-sm gap-1 leading-relaxed items-center px-1 py-px" style="font-size: 9px;color: var(--badge-foreground);background: var(--badge-background);">
        <div class="cursor-pointer" title="${l10n.t("Switch Organization")}"><span id="switch-org" class="material-symbols-rounded">sync_alt</span></div>
        <div class="cursor-pointer" id="switch-org" title="${l10n.t("Individual")}">
          ${l10n.t("Individual")}
        </div>
      </div>
    </div>`}
      ${logout}
    </div>
    `;
    let settingOptions = `<vscode-divider style="border-top: calc(var(--border-width) * 1px) solid var(--panel-view-border);"></vscode-divider>
    <div class="flex gap-2 items-center">
      <b>${l10n.t("Inline Completion")}</b>
      <vscode-link href="${Uri.parse(`command:workbench.action.openGlobalKeybindings?${encodeURIComponent(JSON.stringify(`${extensionNameKebab}.inlineSuggest.`))}`)}" title="${l10n.t("Set Keyboard Shortcuts")}">
        <span class="material-symbols-rounded">keyboard</span>
      </vscode-link>
    </div>
    <div class="ml-4 mb-4">
      <div class="container px-2 min-w-max">
        <label slot="label" class="-ml-2">${l10n.t("Trigger Delay")}</label>
        <div class="sliderLabels">
          <span class="cursor-pointer ${trigger} ${completionDelay === 0 ? "active" : ""} material-symbols-rounded" onclick="vscode.postMessage({ type: 'completionDelay', value: 0 })" title="${l10n.t("Instant")}">timer</span>
          <span class="cursor-pointer ${trigger} ${completionDelay === 500 ? "active" : ""}" onclick="vscode.postMessage({ type: 'completionDelay', value: 500 })" title="${l10n.t("Delay {0}s", "0.5")}">0.5</span>
          <span class="cursor-pointer ${trigger} ${completionDelay === 1000 ? "active" : ""}" onclick="vscode.postMessage({ type: 'completionDelay', value: 1000 })" title="${l10n.t("Delay {0}s", "1")}">1.0</span>
          <span class="cursor-pointer ${trigger} ${completionDelay === 1500 ? "active" : ""}" onclick="vscode.postMessage({ type: 'completionDelay', value: 1500 })" title="${l10n.t("Delay {0}s", "1.5")}">1.5</span>
          <span class="cursor-pointer ${trigger} ${completionDelay === 2000 ? "active" : ""}" onclick="vscode.postMessage({ type: 'completionDelay', value: 2000 })" title="${l10n.t("Delay {0}s", "2")}">2.0</span>
          <span class="cursor-pointer ${trigger} ${completionDelay === 2500 ? "active" : ""}" onclick="vscode.postMessage({ type: 'completionDelay', value: 2500 })" title="${l10n.t("Delay {0}s", "2.5")}">2.5</span>
          <span class="cursor-pointer ${trigger} ${completionDelay === 3000 ? "active" : ""}" onclick="vscode.postMessage({ type: 'completionDelay', value: 3000 })" title="${l10n.t("Delay {0}s", "3")}">3.0</span>
          <span class="cursor-pointer ${completionDelay === 3500 ? "active" : ""} material-symbols-rounded" onclick="vscode.postMessage({ type: 'completionDelay', value: 3500 })" title="${l10n.t("Manual")}">block</span>
        </div>
        <input type="range" min="0" max="3500" value="${completionDelay}" step="500" class="slider" id="triggerDelay">
      </div>
    </div>
    <div class="ml-4 mb-4">
      <div class="container px-2 min-w-max">
        <label slot="label" class="-ml-2">${l10n.t("Completion Preference")}</label>
        <div class="sliderLabels">
          <span class="cursor-pointer material-symbols-rounded ${completionPreference === CompletionPreferenceType.singleLine ? "active" : ""}" onclick="vscode.postMessage({ type: 'completionPreference', value: 0 })" title="${l10n.t("Single Line")}">text_select_jump_to_end</span>
          <span class="cursor-pointer material-symbols-rounded ${completionPreference === CompletionPreferenceType.balanced ? "active" : ""}" onclick="vscode.postMessage({ type: 'completionPreference', value: 1 })" title="${l10n.t("Balanced")}">notes</span>
          <span class="cursor-pointer material-symbols-rounded ${completionPreference === CompletionPreferenceType.bestEffort ? "active" : ""}" onclick="vscode.postMessage({ type: 'completionPreference', value: 2 })" title="${l10n.t("Best Effort")}">all_inclusive</span>
        </div>
        <input type="range" min="0" max="2" value="${completionPreference === CompletionPreferenceType.singleLine ? 0 : completionPreference === CompletionPreferenceType.balanced ? 1 : 2}" class="slider" id="completionPreference">
      </div>
    </div>
    <div class="ml-4 mb-4">
      <div class="container px-2 min-w-max">
        <label slot="label" class="-ml-2">${l10n.t("Max Candidate Number")}</label>
        <div class="sliderLabels">
          <span class="cursor-pointer material-symbols-rounded ${candidates === 1 ? "active" : ""}" onclick="vscode.postMessage({ type: 'candidates', value: 1 })" title="${l10n.t("1 Candidate")}">looks_one</span>
          <span class="cursor-pointer material-symbols-rounded ${candidates === 2 ? "active" : ""}" onclick="vscode.postMessage({ type: 'candidates', value: 2 })" title="${l10n.t("{0} Candidates", 2)}">filter_2</span>
          <span class="cursor-pointer material-symbols-rounded ${candidates === 3 ? "active" : ""}" onclick="vscode.postMessage({ type: 'candidates', value: 3 })" title="${l10n.t("{0} Candidates", 3)}">filter_3</span>
        </div>
        <input type="range" min="1" max="3" value="${candidates}" class="slider" class="slider" id="candidateNumber">
      </div>
    </div>
    <vscode-divider style="border-top: calc(var(--border-width) * 1px) solid var(--panel-view-border);"></vscode-divider>
    <div class="flex gap-2 items-center">
    <b>${l10n.t("Code Assistant")}</b>
    <vscode-link href="${Uri.parse(`command:workbench.action.openGlobalKeybindings?${encodeURIComponent(JSON.stringify(`${extensionNameKebab}.chat.`))}`)}" title="${l10n.t("Set Keyboard Shortcuts")}">
      <span class="material-symbols-rounded">keyboard</span>
    </vscode-link>
    </div>
    <div class="ml-4">
      <vscode-radio-group id="responseModeRadio" class="flex flex-wrap px-2">
        <label slot="label" class="-ml-2">${l10n.t("Show Response")}</label>
        <vscode-radio ${streamResponse ? "checked" : ""} class="w-40" value="Streaming" title="${l10n.t("Display the response streamingly, you can stop it at any time")}">
          ${l10n.t("Streaming")}
        </vscode-radio>
        <vscode-radio ${streamResponse ? "" : "checked"} class="w-40" value="Monolithic" title="${l10n.t("Wait entire result returned, and display at once")}">
          ${l10n.t("Monolithic")}
        </vscode-radio>
      </vscode-radio-group>
    </div>
    <vscode-divider style="border-top: calc(var(--border-width) * 1px) solid var(--panel-view-border);"></vscode-divider>
    <div class="flex gap-2 items-center ${knowledgeBaseEnable ? "" : "opacity-50"}">
      <b>${l10n.t("Retrieval Argumention")}</b>
      <vscode-badge class="${activeOrg ? "hidden" : "opacity-50"}">Pro</vscode-badge>
    </div>
    <div class="ml-4 my-1">
      <label class="my-1 ${knowledgeBaseEnable ? "" : "opacity-50"}" slot="label">${l10n.t("Reference Source")}</label>
      <div class="flex flex-wrap ml-2 my-1">
        <vscode-checkbox ${knowledgeBaseEnable ? "" : "disabled"} class="w-40" id="knowledgeBaseRef" ${knowledgeBaseEnable && raccoonManager.knowledgeBaseRef ? "checked" : ""}>${l10n.t("Knowledge Base")}</vscode-checkbox>
        <vscode-checkbox ${knowledgeBaseEnable ? "" : "disabled"} class="w-40 hidden" id="workspaceRef" ${knowledgeBaseEnable && raccoonManager.workspaceRef ? "checked" : ""}>${l10n.t("Workspace Folder(s)")}</vscode-checkbox>
        <vscode-checkbox ${knowledgeBaseEnable ? "" : "disabled"} class="w-40 hidden" id="webRef" ${knowledgeBaseEnable && raccoonManager.webRef ? "checked" : ""}>${l10n.t("Internet")}</vscode-checkbox>
      </div>
    </div>
    <vscode-divider style="border-top: calc(var(--border-width) * 1px) solid var(--panel-view-border);"></vscode-divider>
    <div class="flex flex-col">
      <vscode-checkbox id="privacy" ${raccoonManager.privacy ? "checked" : ""}>${l10n.t("Join the User Experience Improvement Program")}</vscode-checkbox>
      <div style="display: flex; align-items: center; gap: 10px; margin: 4px 0;">
        <span class="material-symbols-rounded text-2xl" style="font-size: 18px;margin: 0 -1px;">bug_report</span><span id="report-issue" style="cursor: pointer">${l10n.t("Report Issue")}</span>
      </div>
    </div>
    <div class="flex grow place-content-center py-8">
    <vscode-button id="clearAll" class="mx-2 self-end w-60" appearance="secondary">
      ${l10n.t("Clear all settings")}
      <span slot="start" class="material-symbols-rounded">settings_power</span>
    </vscode-button>
    </div>
  </div>
  `;
    let settingPage = `
    <div id="settings" class="h-screen select-none flex flex-col gap-2 mx-auto p-4 max-w-md">
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
        <span class="-ml-2">${l10n.t("Code Engine")}</span>
        <div class="flex flex-row">
          <span class="material-symbols-rounded attach-btn-left" style="padding: 3px; background-color: var(--dropdown-background);" title="${l10n.t("Code Engine")}">assistant</span>
          ${esList}
          <vscode-link href="${setEngineUri}" class="pt-px attach-btn-right" title="${l10n.t("Settings")}">
            <span class="material-symbols-rounded">tune</span>
          </vscode-link>
        </div>
      </div>
      ${loginForm || settingOptions}`;

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
          await this.showWelcome();
          break;
        }
        case 'listAgent': {
          let value = Array.from(raccoonManager.agent.values());
          this.sendMessage({ type: 'agentList', value });
          break;
        }
        case 'listPrompt': {
          this.sendMessage({ type: 'promptList', value: raccoonManager.prompt });
          break;
        }
        case 'promptManage': {
          commands.executeCommand(`${extensionNameKebab}.prompt.manage`);
          break;
        }
        case 'openDoc': {
          let allTabGroups = window.tabGroups.all;
          for (let tg of allTabGroups) {
            for (let tab of tg.tabs) {
              if (tab.input instanceof TabInputText && tab.input.uri.toString() === data.file) {
                window.showTextDocument(tab.input.uri, { viewColumn: tab.group.viewColumn, selection: data.range });
                break;
              }
            }
          }
          window.showTextDocument(Uri.parse(data.file), { preview: false, selection: data.range });
          break;
        }
        case 'login': {
          if (!data.account || !data.password) {
            this.sendMessage({ type: 'showInfoTip', style: "error", category: 'login-invalid', value: l10n.t("Login failed"), id: new Date().valueOf() });
            break;
          }
          raccoonManager.getTokenFromLoginResult(`authorization://password?${encodeURIComponent(JSON.stringify(data))}`).then((res) => {
            if (res !== "ok") {
              this.sendMessage({ type: 'showInfoTip', style: "error", category: 'login-failed', value: l10n.t("Login Failed") + ": " + res.message, id: new Date().valueOf() });
            }
          });
          break;
        }
        case 'searchQuery': {
          this.sendMessage({ type: 'addSearch', value: '?' + data.query });
          for (let url of data.searchUrl) {
            if (url.startsWith(`${extensionNameKebab}://raccoon.search/stackoverflow`)) {
              let q = url.replace('${query}', `${encodeURIComponent(JSON.stringify({ "query": data.query }))}`);
              commands.executeCommand('vscode.openWith', Uri.parse(q), raccoonSearchEditorProviderViewType);
            } else {
              let q = url.replace('${query}', encodeURIComponent(data.query));
              commands.executeCommand("vscode.open", q);
            }
          }
          break;
        }
        case 'deleteQA': {
          this.cache.removeCacheItem(data.id);
          break;
        }
        case 'addAgent': {
          this.sendMessage({ type: 'addAgent', value: data.id });
          break;
        }
        case 'sendQuestion': {
          let editor = this.lastTextEditor;
          if (window.activeTextEditor && this.isSupportedScheme(window.activeTextEditor.document)) {
            editor = window.activeTextEditor;
          }
          let prompt: RaccoonPrompt = data.prompt;
          if (prompt.message.role === Role.function) {
            switch (prompt.type) {
              case PromptType.help: {
                let tm = new Date();
                let id = tm.valueOf();
                let isMac = data.userAgent.includes("Mac OS X");
                let timestamp = tm.toLocaleString();
                let robot = raccoonManager.getActiveClientRobotName() || "Raccoon";
                let helplink = `<a class="reflink flex items-center gap-2 my-2 p-2 leading-loose rounded" style="background-color: var(--vscode-editorCommentsWidget-rangeActiveBackground);" href="command:${extensionNameKebab}.help">
                <span class="material-symbols-rounded">book</span>
                <div class="inline-block leading-loose">${l10n.t("Read Raccoon document for more information")}</div>
                <span class="material-symbols-rounded grow text-right">keyboard_double_arrow_right</span>
              </a>`;
                let loginHint = raccoonManager.isClientLoggedin() ? "" : this.buildLoginHint();
                this.sendMessage({ type: 'addMessage', category: PromptType.help, robot, value: makeGuide(isMac) + loginHint + helplink, timestamp });
                this.sendMessage({ type: 'stopResponse', id });
                break;
              }
            }
            break;
          }
          if (editor && !data.values) {
            prompt.code = editor.document.getText(editor.selection);
            if (editor.document.languageId !== "plaintext") {
              prompt.languageid = editor.document.languageId;
            }
          }
          if (prompt.type === PromptType.freeChat) {
            if (prompt.code && !prompt.message.content.includes("{{code}}")) {
              prompt.message.content += "\n{{code}}\n";
            }
          }
          let promptInfo = new PromptInfo(prompt);
          let history = await this.cache.getCacheItems();
          this.sendApiRequest(promptInfo, data.values, history);
          break;
        }
        case 'stopGenerate': {
          if (data.id) {
            this.stopList[data.id]?.abort();
            this.sendMessage({ type: 'stopResponse', id: data.id, byUser: true });
          } else {
            for (let id in this.stopList) {
              this.stopList[id]?.abort();
              this.sendMessage({ type: 'stopResponse', id, byUser: true });
            }
          }
          break;
        }
        case 'diff': {
          let selection = editor?.document.getText(editor?.selection);
          if (data.languageid && selection && data.value) {
            diffCode(data.languageid, selection, data.value);
          } else {
            this.sendMessage({ type: 'showInfoTip', style: "error", category: 'no-diff-content', value: l10n.t("No diff content"), id: new Date().valueOf() });
          }
          break;
        }
        case 'editCode': {
          let found = false;
          const editor = window.activeTextEditor || this.lastTextEditor;
          let docUri = editor?.document.uri;
          if (editor && docUri) {
            let tgs = window.tabGroups.all;
            for (let tg of tgs) {
              for (let t of tg.tabs) {
                if (t.isActive && (t.input instanceof TabInputText || t.input instanceof TabInputNotebook) && t.input.uri.toString() === docUri.toString()) {
                  found = true;
                  let editAction = (edit: TextEditorEdit) => {
                    if (editor.selection) {
                      edit.delete(editor.selection);
                    }
                    edit.insert(editor.selection.anchor, data.value.trimEnd() + "\n");
                  };
                  editor.edit(editAction);
                }
              }
            }
          }
          if (!found) {
            this.sendMessage({ type: 'showInfoTip', style: "error", category: 'no-active-editor', value: l10n.t("No active editor found"), id: new Date().valueOf() });
          }
          break;
        }
        case 'activeEngine': {
          raccoonManager.setActiveClient(data.value);
          break;
        }
        case 'switch-org': {
          raccoonManager.switchOrganization();
          break;
        }
        case 'logout': {
          let ae = raccoonManager.getActiveClientRobotName() || "Raccoon";
          window.showWarningMessage(
            l10n.t("Logout from {0}?", ae),
            { modal: true },
            l10n.t("OK"))
            .then((v) => {
              if (v === l10n.t("OK")) {
                raccoonManager.logout();
              }
            });
          break;
        }
        case 'completionPreference': {
          if (data.value === 0) {
            raccoonManager.completionPreference = CompletionPreferenceType.singleLine;
          } else if (data.value === 1) {
            raccoonManager.completionPreference = CompletionPreferenceType.balanced;
          } else if (data.value === 2) {
            raccoonManager.completionPreference = CompletionPreferenceType.bestEffort;
          }
          break;
        }
        case 'responseMode': {
          if (raccoonManager.streamResponse !== (data.value === "Streaming")) {
            raccoonManager.streamResponse = (data.value === "Streaming");
          }
          break;
        }
        case 'completionDelay': {
          if (data.value !== raccoonManager.completionDelay) {
            raccoonManager.completionDelay = data.value;
            raccoonManager.autoComplete = (data.value !== 3500);
          }
          break;
        }
        case 'candidates': {
          if (data.value <= 0) {
            data.value = 1;
          }
          raccoonManager.candidates = data.value;
          break;
        }
        case 'clearAll': {
          window.showWarningMessage(
            l10n.t("Clear all settings?"),
            { modal: true, detail: l10n.t("It will clear all your cached information, including:\n\n\t• Account authorization\n\t• Chace history\n\t• Code snippets in favorites\n\t• Custom prompts\n\n\tAnd reset all other settings to default.\n") },
            l10n.t("OK"))
            .then(v => {
              if (v === l10n.t("OK")) {
                commands.executeCommand("keybindings.editor.resetKeybinding", `${extensionNameKebab}.inlineSuggest.trigger`);
                HistoryCache.deleteAllCacheFiles(this.context, true);
                FavoriteCodeEditor.deleteSnippetFiles();
                raccoonManager.clear();
              }
            });
          break;
        }
        case 'knowledgeBaseRef': {
          if (!!data.value) {
            await raccoonManager.listKnowledgeBase(true);
            raccoonManager.knowledgeBaseRef = true;
          } else {
            raccoonManager.knowledgeBaseRef = false;
          }
          break;
        }
        case 'workspaceRef': {
          raccoonManager.workspaceRef = !!data.value;
          break;
        }
        case 'webRef': {
          raccoonManager.webRef = !!data.value;
          break;
        }
        case 'privacy': {
          raccoonManager.privacy = !!data.value;
          break;
        }
        case 'addFavorite': {
          commands.executeCommand("vscode.openWith", Uri.parse(`${extensionNameKebab}://raccoon.favorites/${data.id}.raccoon.favorites?${encodeURIComponent(JSON.stringify({ title: `${l10n.t("Favorite Snippet")} [${data.id}]` }))}#${encodeURIComponent(JSON.stringify(data))}`), favoriteCodeEditorViewType);
          break;
        }
        case 'bug-report': {
          let issueTitle;
          let issueBody;
          let hinfos = await this.cache.getCacheItemWithId(data.id);
          if (hinfos.length >= 2) {
            let qinfo = hinfos.filter((v, _idx, _arr) => {
              return v.type === CacheItemType.question;
            });
            let ainfo = hinfos.filter((v, _idx, _arr) => {
              return v.type === CacheItemType.answer;
            });
            let einfo = hinfos.filter((v, _idx, _arr) => {
              return v.type === CacheItemType.error;
            });
            issueTitle = '[Feedback]';
            let renderRequestBody = qinfo[0]?.value;
            if (renderRequestBody) {
              issueTitle = '[Need Improvement]';
              issueBody = `## Your question\n\n
${renderRequestBody}
${ainfo[0]?.value ? `\n\n## Raccoon's answer\n\n${ainfo[0].value}\n\n` : ""}
${einfo[0]?.value ? `\n\n## Raccoon's error\n\n${einfo[0].value}\n\n` : ""}
## Your expection
`;
            }
          }
          commands.executeCommand("workbench.action.openIssueReporter", { extensionId: this.context.extension.id, issueTitle, issueBody });
          break;
        }
        case 'telemetry': {
          let tinfo = data as TelemetryInfo;
          if (!env.isTelemetryEnabled) {
            window.showInformationMessage("Thanks for your feedback, Please enable `telemetry.telemetryLevel` to send data to us.", "OK").then((v) => {
              if (v === "OK") {
                commands.executeCommand("workbench.action.openGlobalSettings", { query: "telemetry.telemetryLevel" });
              }
            });
            break;
          }

          /* eslint-disable  @typescript-eslint/naming-convention */
          let code_accept_usage: any;
          let dialog_window_usage: any;

          switch (tinfo.action) {
            case "like-cancelled": {
              dialog_window_usage = {
                // positive_feedback_num: -1
              };
              break;
            }
            case "like": {
              dialog_window_usage = {
                positive_feedback_num: 1
              };
              break;
            }
            case "dislike-cancelled": {
              dialog_window_usage = {
                // negative_feedback_num: -1
              };
              break;
            }
            case "dislike": {
              dialog_window_usage = {
                negative_feedback_num: 1
              };
              break;
            }
            case "regenerate": {
              dialog_window_usage = {
                // user_question_num: -1,
                regenerate_answer_num: 1
              };
              break;
            }
            case "code-generated": {
              let metrics_by_language: any = {};
              metrics_by_language[tinfo.languageid || "Unknown"] = {
                code_generate_num: 1
              };
              code_accept_usage = { metrics_by_language };
              break;
            }
            case "diff-code": {
              let metrics_by_language: any = {};
              metrics_by_language[tinfo.languageid || "Unknown"] = {
                code_compare_num: 1
              };
              code_accept_usage = { metrics_by_language };
              break;
            }
            case "copy-snippet": {
              let metrics_by_language: any = {};
              metrics_by_language[tinfo.languageid || "Unknown"] = {
                code_copy_num: 1
              };
              code_accept_usage = { metrics_by_language };
              break;
            }
            case "insert-snippet": {
              let metrics_by_language: any = {};
              metrics_by_language[tinfo.languageid || "Unknown"] = {
                code_insert_num: 1
              };
              code_accept_usage = { metrics_by_language };
              break;
            }
          }

          telemetryReporter.logUsage(MetricType.dialog, {
            code_accept_usage,
            dialog_window_usage
          });
          /* eslint-enable */
          break;
        }
        default:
          break;
      }
    });

    const editor = window.activeTextEditor || this.lastTextEditor;
    if (editor && this.checkCodeReady(editor)) {
      setTimeout(() => {
        let content = editor.document.getText(editor.selection);
        let lang = editor.document.languageId;
        this.sendMessage({ type: 'codeReady', value: true, file: editor.document.uri.toString(), range: editor.selections[0], lang, content });
      }, 1000);
    }
  }

  private checkCodeReady(editor: TextEditor): boolean {
    let codeReady = editor.selection?.isEmpty === false;
    if (codeReady) {
      if (this.isSupportedScheme(editor.document)) {
        if (editor.selections[0]) {
          let doc = editor.document;
          let text = doc.getText(editor.selections[0]);
          if (text.trim()) {
            return true;
          }
        }
      }
    }
    return false;
  }

  public async sendApiRequest(prompt: PromptInfo, values?: any, history?: CacheItem[]) {
    let ts = new Date();
    let id = ts.valueOf();
    let response = "";
    let reqTimestamp = ts.toLocaleString();

    let loggedin = raccoonManager.isClientLoggedin();
    let userinfo = await raccoonManager.userInfo();
    let org = raccoonManager.activeOrganization();
    let username = org?.username || userinfo?.username;
    if (!loggedin || !username) {
      this.sendMessage({ type: 'showInfoTip', style: "error", category: 'unauthorized', value: l10n.t("Unauthorized"), id });
      return;
    }

    let streaming = raccoonManager.streamResponse;
    let instruction = prompt.prompt;

    let promptHtml = prompt.generatePromptHtml(id, values);
    if (promptHtml.status === RenderStatus.codeMissing) {
      this.sendMessage({ type: 'showInfoTip', style: "error", category: 'no-code', value: l10n.t("No code selected"), id });
      return;
    }
    let el = (instruction.content.length * 2) + (promptHtml.prompt.code?.length ? promptHtml.prompt.code.length / 3 : 0);
    let maxTokens = raccoonManager.maxInputTokenNum(ModelCapacity.assistant);

    let avatar = userinfo?.avatar;
    let robot = raccoonManager.getActiveClientRobotName() + (org ? ` (${org.name})` : "");

    if (promptHtml.status === RenderStatus.editRequired) {
      this.sendMessage({ type: 'addQuestion', username, avatar, robot, value: promptHtml, streaming, id, timestamp: reqTimestamp });
    } else {
      this.sendMessage({ type: 'addQuestion', username, avatar, robot, value: promptHtml, streaming, id, timestamp: reqTimestamp });
      try {
        if (promptHtml.prompt.code) {
          let codeBlock = `\n\`\`\`${promptHtml.prompt.languageid || ""}\n${promptHtml.prompt.code}\n\`\`\``;
          instruction.content = instruction.content.replace(/\{\{code\}\}/g,
            () => {
              return codeBlock;
            });
        } else {
          instruction.content = instruction.content.replace(/\{\{code\}\}/g, "");
        }
        let historyMsgs: Message[] = [];
        if (history) {
          let hs = Array.from(history).reverse();
          for (let h of hs) {
            let role = Role.user;
            if (h.type !== CacheItemType.question) {
              role = Role.assistant;
            }
            let aLen = (h.value.length) * 2 + 12;
            if ((el + aLen) > maxTokens) {
              break;
            }
            el += aLen;
            historyMsgs.push({
              role,
              content: h.value
            });
          }
        }
        this.cache.appendCacheItem({ id, name: username, timestamp: reqTimestamp, type: CacheItemType.question, instruction: prompt.label, value: instruction.content });

        historyMsgs = historyMsgs.reverse();

        // eslint-disable-next-line @typescript-eslint/naming-convention
        telemetryReporter.logUsage(MetricType.dialog, { dialog_window_usage: { user_question_num: 1 } });

        let errorFlag = false;
        let msgs = [...historyMsgs, { role: instruction.role, content: raccoonManager.buildFillPrompt(ModelCapacity.assistant, '', instruction.content) || "" }];
        if (streaming) {
          raccoonManager.chat(
            msgs,
            {
              stream: true,
              n: 1
            },
            {
              thisArg: this,
              onHeader: (headers: Headers) => {
                let fs = headers.get("x-raccoon-know-files");
                if (fs) {
                  this.sendMessage({ type: 'addReference', files: fs.split(","), id });
                }
              },
              onController(controller, thisArg) {
                let h = <RaccoonEditor>thisArg;
                h.stopList[id] = controller;
              },
              onError(err: Choice, thisArg) {
                let h = <RaccoonEditor>thisArg;
                outlog.error(JSON.stringify(err));
                let rts = new Date().toLocaleString();
                let errmsg = err.message?.content || "";
                switch (err.index) {
                  case -3008: {
                    errmsg = l10n.t("Connection error. Check your network settings.");
                    break;
                  } default: {
                    break;
                  }
                }
                h.cache.appendCacheItem({ id, name: raccoonManager.getActiveClientRobotName() || "Raccoon", timestamp: rts, type: CacheItemType.error, value: errmsg });
                h.sendMessage({ type: 'addError', error: errmsg, id, timestamp: rts });
                errorFlag = true;
              },
              onFinish(choices: Choice[], thisArg) {
                let h = <RaccoonEditor>thisArg;
                if (!errorFlag) {
                  let rts = new Date().toLocaleString();
                  h.cache.appendCacheItem({ id, name: raccoonManager.getActiveClientRobotName() || "Raccoon", timestamp: rts, type: CacheItemType.answer, value: response });
                  // eslint-disable-next-line @typescript-eslint/naming-convention
                  telemetryReporter.logUsage(MetricType.dialog, { dialog_window_usage: { model_answer_num: 1 } });
                }
                delete h.stopList[id];
                h.sendMessage({ type: 'stopResponse', id });
              },
              onUpdate(choice: Choice, thisArg) {
                let rts = new Date().toLocaleString();
                if (choice.finishReason === FinishReason.sensitive) {
                  thisArg.sendMessage({ type: 'addError', error: l10n.t("Potentially Sensitive Content Encountered"), id, timestamp: rts });
                  return;
                } else if (choice.finishReason === FinishReason.length) {
                } else if (choice.finishReason === FinishReason.context) {
                  thisArg.sendMessage({ type: 'addError', error: l10n.t("Context Too long"), id, timestamp: rts });
                  return;
                }
                response += choice.message?.content || "";
                thisArg.sendMessage({ type: 'updateResponse', id, value: response, timestamp: rts });
              }
            },
            buildHeader(this.context.extension, prompt.type, `${id}`)
          );
        } else {
          await raccoonManager.chat(
            msgs,
            {
              n: 1
            },
            {
              thisArg: this,
              onHeader: (headers: Headers) => {
                let fs = headers.get("x-raccoon-know-files");
                if (fs) {
                  this.sendMessage({ type: 'addReference', files: fs.split(","), id });
                }
              },
              onController(controller, thisArg) {
                let h = <RaccoonEditor>thisArg;
                h.stopList[id] = controller;
              },
              onError(err, thisArg) {
                let h = <RaccoonEditor>thisArg;
                outlog.error(JSON.stringify(err));
                let rts = new Date().toLocaleString();
                h.sendMessage({ type: 'addError', error: err.message?.content || "", id, timestamp: rts });
                h.cache.appendCacheItem({ id, name: raccoonManager.getActiveClientRobotName() || "Raccoon", timestamp: rts, type: CacheItemType.error, value: err.message?.content || "" });
                errorFlag = true;
              },
              onFinish(choices, thisArg) {
                let h = <RaccoonEditor>thisArg;
                let rts = new Date().toLocaleString();
                if (!errorFlag) {
                  h.cache.appendCacheItem({ id, name: raccoonManager.getActiveClientRobotName() || "Raccoon", timestamp: rts, type: CacheItemType.answer, value: choices[0].message?.content || "" });
                  // eslint-disable-next-line @typescript-eslint/naming-convention
                  telemetryReporter.logUsage(MetricType.dialog, { dialog_window_usage: { model_answer_num: 1 } });
                }
                h.sendMessage({ type: 'updateResponse', id, value: choices[0].message?.content, timestamp: rts });
                delete h.stopList[id];
                h.sendMessage({ type: 'stopResponse', id });
              }
            },
            buildHeader(this.context.extension, prompt.type, `${id}`));
        }
      } catch (err: any) {
        if (err.name === "CanceledError") {
          delete this.stopList[id];
          this.sendMessage({ type: 'stopResponse', id });
          return;
        }
        let error = err.response?.statusText || err.message;
        if (err.response?.data?.error) {
          error = err.response.data.error;
        }
        this.sendMessage({ type: 'addError', error, id });
      }
    }
  }

  public async sendMessage(message: any) {
    if (this.webview) {
      this.webview.postMessage(message);
    }
  }

  public async clear(showWelcome?: boolean) {
    for (let id in this.stopList) {
      this.stopList[id].abort();
    }
    this.cache = new HistoryCache(this.context, `${env.sessionId}-${new Date().valueOf()}`);
    this.sendMessage({ type: "clear" });
    if (showWelcome) {
      this.showWelcome();
    }
  }

  private async getWebviewHtml(webview: Webview) {
    const scriptUri = webview.asWebviewUri(Uri.joinPath(this.context.extensionUri, 'media', 'main.js'));
    const stylesMainUri = webview.asWebviewUri(Uri.joinPath(this.context.extensionUri, 'media', 'main.css'));

    const vendorHighlightCss = webview.asWebviewUri(Uri.joinPath(this.context.extensionUri, 'media', 'vendor', 'highlight.min.css'));
    const vendorHighlightJs = webview.asWebviewUri(Uri.joinPath(this.context.extensionUri, 'media', 'vendor', 'highlight.min.js'));
    const vendorMarkedJs = webview.asWebviewUri(Uri.joinPath(this.context.extensionUri, 'media', 'vendor', 'marked.min.js'));
    const mermaidJs = webview.asWebviewUri(Uri.joinPath(this.context.extensionUri, 'media', 'vendor', 'mermaid.min.js'));
    const vendorTailwindJs = webview.asWebviewUri(Uri.joinPath(this.context.extensionUri, 'media', 'vendor', 'tailwindcss.3.2.4.min.js'));
    const toolkitUri = webview.asWebviewUri(Uri.joinPath(this.context.extensionUri, "media", "vendor", "toolkit.js"));
    const iconUri = webview.asWebviewUri(Uri.joinPath(this.context.extensionUri, 'media', 'MaterialSymbols', 'materialSymbols.css'));
    const avatarUri = webview.asWebviewUri(Uri.joinPath(this.context.extensionUri, 'media', 'raccoon-logo.png'));

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
                <script src="${mermaidJs}"></script>
                <script src="${vendorTailwindJs}"></script>
                <script type="module" src="${toolkitUri}"></script>
                <style>
                .robot-avatar {
                  background-image: url("${avatarUri}");
                  -webkit-mask: url("${avatarUri}");
                  -webkit-mask-size: contain;
                }
                </style>
            </head>
            <body class="overflow-hidden">
              <div id="setting-page"></div>
              <div class="flex flex-col h-screen" id="qa-list-wrapper">
                <vscode-panel-view id="view-1" class="grow overflow-y-auto p-0 m-0">
                  <div class="flex flex-col flex-1 overflow-y-auto" id="qa-list">
                    <vscode-progress-ring class="progress-ring w-full content-center mt-32"></vscode-progress-ring>
                  </div>
                </vscode-panel-view>
                <div id="msg-wrapper">
                </div>
                <div id="chat-button-wrapper" class="w-full flex flex-col justify-center items-center px-1 gap-1">
                  <div id="search-list" class="flex flex-col w-full py-2 hidden">
                    <vscode-checkbox class="px-2 py-1 m-0" checked title='Search in StackOverflow' data-query='${extensionNameKebab}://raccoon.search/stackoverflow.search?\${query}'>
                      StackOverflow
                    </vscode-checkbox>
                    <vscode-checkbox class="px-2 py-1 m-0" title='Search in StackOverflow w/ DuckDuckGo' data-query='https://duckduckgo.com/?q=site%3Astackoverflow.com+\${query}'>
                      StackOverflow [DuckDuckGo]
                    </vscode-checkbox>
                    <vscode-checkbox class="px-2 py-1 m-0" title='Search in Quora' data-query='https://www.quora.com/search?q=\${query}'>
                      Quora [Web]
                    </vscode-checkbox>
                    <vscode-checkbox class="px-2 py-1 m-0" title='Search in Zhihu' data-query='https://www.zhihu.com/search?q=\${query}'>
                      Zhihu [Web]
                    </vscode-checkbox>
                    <vscode-checkbox class="px-2 py-1 m-0" title='Search in C++ Reference w/ DuckDuckGo' data-query='https://duckduckgo.com/?q=site%3Adocs.python.org+\${query}'>
                      Python Reference [DuckDuckGo]
                    </vscode-checkbox>
                    <vscode-checkbox class="px-2 py-1 m-0" title='Search in C++ Reference w/ DuckDuckGo' data-query='https://duckduckgo.com/?q=site%3Acppreference.com+\${query}'>
                      C++ Reference [DuckDuckGo]
                    </vscode-checkbox>
                    <vscode-checkbox class="px-2 py-1 m-0" title='Search in MDN Web Docs' data-query='https://developer.mozilla.org/zh-CN/search?q=\${query}'>
                      MDN Web Docs [Web]
                    </vscode-checkbox>
                  </div>
                  <div id="agent-list" class="flex flex-col hidden">
                  </div>
                  <div id="ask-list" class="flex flex-col hidden">
                  </div>
                  <div id="attach-code-container" class="hidden" title="${l10n.t("Code attached")}">
                  <div id="code-title"></div>
                  <pre id="attach-code-wrapper"><code id="attach-code"></code></pre>
                  </div>
                  <div id="question" class="w-full flex justify-center items-center">
                    <span class="material-symbols-rounded opacity-60 history-icon">
                      history
                    </span>
                    <div class="op-hint">
                      <div class="search-hint items-center">
                        <kbd><span class="material-symbols-rounded">keyboard_return</span>Enter</kbd>${l10n.t("Search")}
                      </div>
                      <div class="history-hint items-center" style="margin-left: 1rem;">
                      <kbd><span class="material-symbols-rounded">keyboard_return</span>Enter</kbd>${l10n.t("Send")}
                      </div>
                      <div class="history-hint items-center">
                      <kbd><span class="material-symbols-rounded">keyboard_tab</span>Tab</kbd>${l10n.t("Revise")}
                      </div>
                      <div class="history-hint items-center">
                        <kbd><span class="material-symbols-rounded">first_page</span>Esc</kbd>${l10n.t("Clear")}
                      </div>
                    </div>
                    <label id="question-sizer" data-value
                          data-placeholder="${l10n.t("Ask Raccoon a question") + ", " + l10n.t("or type '/' for prompts")}"
                          data-placeholder-short="${l10n.t("Ask Raccoon a question")}"
                          data-hint="${l10n.t("Pick one prompt to send")} [Enter]"
                          data-agent-hint="${l10n.t("Pick one agent")} [Enter]"
                          data-tip="${l10n.t("Ask Raccoon a question") + ", " + l10n.t("or type '/' for prompts")}"
                          data-tip1="${l10n.t("Type [Shift + Enter] to start a new line")}"
                          data-tip2="${l10n.t("Press [Esc] to stop responding")}"
                          data-tip3="${l10n.t("Press ↑/↓ key to recall history")}"
                          data-tip4="${l10n.t("Type ? to tigger search")}"
                          data-tip5="${l10n.t("Clear button can be found on the top of this view")}"
                    >
                      <div id="backdrop">
                        <div id="highlight-anchor">
                        </div>
                      </div>
                      <textarea id="question-input" oninput="this.parentNode.dataset.value = this.value" rows="1"></textarea>
                    </label>
                    <button id="send-button" title="${l10n.t("Send")} [Enter]">
                      <span class="material-symbols-rounded">send</span>
                    </button>
                    <button id="stop-button" title="${l10n.t("Stop")} [Esc]">
                      <span class="material-symbols-rounded">stop</span>
                    </button>
                    <button id="search-button" title="${l10n.t("Search")} [Enter]">
                      <span class="material-symbols-rounded">search</span>
                    </button>
                  </div>
                </div>
              </div>
              <script>
                const l10nForUI = {
                  "Cancel": "${l10n.t("Cancel")}",
                  "Delete": "${l10n.t("Delete this chat entity")}",
                  "Send": "${l10n.t("Send")}",
                  "ToggleWrap": "${l10n.t("Toggle line wrap")}",
                  "Show graph": "${l10n.t("Show graph")}",
                  "Hide graph": "${l10n.t("Hide graph")}",
                  "Favorite": "${l10n.t("Add to favorites")}",
                  "Diff": "${l10n.t("Diff with original code")}",
                  "Copy": "${l10n.t("Copy to clipboard")}",
                  "Insert": "${l10n.t("Insert the below code at cursor")}",
                  "Thinking...": "${l10n.t("Thinking...")}",
                  "Connecting...": "${l10n.t("Connecting...")}",
                  "Typing...": "${l10n.t("Typing...")}",
                  "Stop responding": "${l10n.t("Stop responding")}",
                  "Regenerate": "${l10n.t("Regenerate")}",
                  "Empty prompt": "${l10n.t("Empty prompt")}"
                };
                mermaid.initialize({ startOnLoad: true });
              </script>
              <script src="${scriptUri}"></script>
            </body>
            </html>`;
  }
}

export class RaccoonViewProvider implements WebviewViewProvider {
  private static editor?: RaccoonEditor;
  private static webviewView?: WebviewView;
  constructor(private context: ExtensionContext) {
    registerCommand(context, "settings", async () => {
      raccoonManager.update();
      commands.executeCommand(`${extensionNameKebab}.view.focus`).then(() => {
        return RaccoonViewProvider.editor?.updateSettingPage("toggle");
      });
    });
    registerCommand(context, "new-chat", async (uri) => {
      if (!uri) {
        RaccoonViewProvider.editor?.clear(true);
      } else {
        let editor = RaccoonEditorProvider.getEditor(uri);
        editor?.clear(true);
      }
      // eslint-disable-next-line @typescript-eslint/naming-convention
      telemetryReporter.logUsage(MetricType.dialog, { dialog_window_usage: { new_session_num: 1 } });
    });
  }

  public static showError(msg: string) {
    RaccoonViewProvider.editor?.sendMessage({ type: 'showInfoTip', style: 'error', category: 'custom', value: msg, id: new Date().valueOf() });
  }

  public resolveWebviewView(
    webviewView: WebviewView,
    _context: WebviewViewResolveContext,
    _token: CancellationToken,
  ) {
    RaccoonViewProvider.editor = new RaccoonEditor(this.context, webviewView.webview);
    RaccoonViewProvider.webviewView = webviewView;
    webviewView.onDidChangeVisibility(() => {
      if (!webviewView.visible) {
        RaccoonViewProvider.editor?.sendMessage({ type: 'updateSettingPage', action: "close" });
      }
    });
    webviewView.onDidDispose(() => {
      RaccoonViewProvider.editor?.sendMessage({ type: 'updateSettingPage', action: "close" });
      RaccoonViewProvider.editor?.dispose();
      RaccoonViewProvider.webviewView = undefined;
    });
  }

  public static isVisible() {
    return RaccoonViewProvider.webviewView?.visible;
  }

  public static async loadHistory(id: string) {
    return RaccoonViewProvider.editor?.loadHistory(id);
  }

  public static async ask(prompt?: PromptInfo) {
    commands.executeCommand(`${extensionNameKebab}.view.focus`);
    while (!RaccoonViewProvider.editor) {
      await new Promise((f) => setTimeout(f, 1000));
    }
    if (RaccoonViewProvider.editor) {
      if (prompt) {
        await new Promise((f) => setTimeout(f, 1000));
        return RaccoonViewProvider.editor.sendApiRequest(prompt);
      } else {
        await new Promise((f) => setTimeout(f, 300));
        RaccoonViewProvider.editor?.sendMessage({ type: 'focus' });
      }
    }
  }
}
