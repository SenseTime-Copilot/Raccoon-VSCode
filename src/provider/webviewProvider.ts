import { window, workspace, WebviewViewProvider, TabInputText, TabInputNotebook, WebviewView, ExtensionContext, WebviewViewResolveContext, CancellationToken, SnippetString, commands, Webview, Uri, l10n, env, TextEditor, Disposable, TextDocument } from 'vscode';
import { raccoonManager, outlog, telemetryReporter } from "../globalEnv";
import { PromptInfo, PromptType, RenderStatus, RaccoonPrompt } from "./promptTemplates";
import { RaccoonEditorProvider } from './assitantEditorProvider';
import { CompletionPreferenceType, ModelCapacity } from './raccoonManager';
import { Message, ResponseEvent, Role } from '../raccoonClient/src/CodeClient';
import { decorateCodeWithRaccoonLabel } from '../utils/decorateCode';
import { buildHeader } from '../utils/buildRequestHeader';
import { diffCode } from './diffContentProvider';
import { HistoryCache, CacheItem, CacheItemType } from '../utils/historyCache';
import { RaccoonSearchEditorProvider } from './searchEditorProvider';
import { FavoriteCodeEditor } from './favoriteCode';
import { raccoonDocsUrl, raccoonResetPasswordUrl, raccoonSignupUrl } from './contants';
import { phoneZoneCode } from '../utils/phoneZoneCode';

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
      } else if (e.scope.includes("prompt")) {
        this.sendMessage({ type: 'promptList', value: raccoonManager.prompt });
      } else if (e.scope.includes("engines")) {
        this.updateSettingPage("full");
      } else if (e.scope.includes("active")) {
        this.updateSettingPage("full");
        this.showWelcome(true);
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
  }

  private buildLoginHint() {
    let robot = raccoonManager.getActiveClientRobotName() || "Raccoon";
    return `<a class="reflink flex items-center gap-2 my-2 p-2 leading-loose rounded" style="background-color: var(--vscode-editorCommentsWidget-rangeActiveBackground);" href="command:raccoon.settings">
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
    let ts = new Date();
    let timestamp = ts.toLocaleString();
    let detail = '';
    let name = raccoonManager.username();
    let category = "welcome";
    let username = '';
    let robot = raccoonManager.getActiveClientRobotName() || "Raccoon";
    if (name) {
      username = ` @${name}`;
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
    let autoComplete = raccoonManager.autoComplete;
    let completionPreference = raccoonManager.completionPreference;
    let streamResponse = raccoonManager.streamResponse;
    let delay = raccoonManager.delay;
    let candidates = raccoonManager.candidates;
    let setEngineUri = Uri.parse(`command:workbench.action.openGlobalSettings?${encodeURIComponent(JSON.stringify({ query: "Raccoon.Engines" }))}`);
    let esList = `<vscode-dropdown id="engineDropdown" class="w-full" value="${raccoonManager.getActiveClientRobotName()}">`;
    let es = raccoonManager.robotNames;
    for (let label of es) {
      esList += `<vscode-option value="${label}">${label}</vscode-option>`;
    }
    esList += "</vscode-dropdown>";
    let userId: string | undefined = undefined;
    let username: string | undefined = undefined;
    let avatarEle = `<span class="material-symbols-rounded" style="font-size: 40px;">person_pin</span>`;
    let loginForm = ``;
    let logout = ``;
    let accountInfo = ``;
    if (!raccoonManager.isClientLoggedin()) {
      await raccoonManager.getAuthUrlLogin().then(authUrl => {
        if (!authUrl) {
          return;
        }
        let url = Uri.parse(authUrl);
        let title;
        if (url.scheme === "command" && url.path !== "raccoon.password") {
          title = l10n.t("Setup Access Key");
        } else {
          title = `${l10n.t("Login")}`;
        }
        loginForm = `<vscode-link title="${title}" href="${url.toString(true)}">
                        <vscode-button>${title}</vscode-button>
                      </vscode-link>`;
        if (url.scheme === "command" && url.path === "raccoon.password") {
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
                      width: calc(100vw - 4rem);
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
                      <div class="flex flex-row mx-4">
                      <span class="material-symbols-rounded attach-btn-left" style="padding: 3px; background-color: var(--dropdown-background);">public</span>
                      <vscode-dropdown class="grow" id="login-code" value="86">
                        ${Object.keys(phoneZoneCode).map((v, _idx, _arr) => `<vscode-option value="${phoneZoneCode[v]}" style="padding: 0 calc(var(--design-unit) * 2px);">${v} (${phoneZoneCode[v]})</vscode-option>`).join('')}
                      </vscode-dropdown>
                      </div>
                      <div class="flex flex-row mx-4">
                      <span class="material-symbols-rounded attach-btn-left" style="padding: 3px; background-color: var(--input-background);">smartphone</span>
                      <vscode-text-field class="grow" type="tel" autofocus pattern="[0-9]{7,11}" maxlength=11 id="login-account" required="required">
                      </vscode-text-field>
                      </div>
                      <div class="flex flex-col mx-4 my-2">
                      <div class="mb-2">
                        <span>${l10n.t("Password")}</span>
                        <vscode-link tabindex="-1" title="${l10n.t("Forgot Password")}?" class="text-xs float-right" href="${raccoonResetPasswordUrl}">
                          ${l10n.t("Forgot Password")}?
                        </vscode-link>
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
                      <span class="flex mx-4 self-center">
                        ${l10n.t("Do not have an account?")}
                        <vscode-link title="${l10n.t("Sign Up")}" class="text-xs mx-1 self-center" href="${raccoonSignupUrl}?utm_source=${encodeURIComponent(env.appName)}">
                          ${l10n.t("Sign Up")}
                        </vscode-link>
                      </span>`;
        }
      }, () => { });
    } else {
      userId = raccoonManager.userId();
      username = raccoonManager.username();
      let avatar = raccoonManager.avatar();
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
        if (url.scheme === "command" && url.path !== "raccoon.password") {
          icon = 'key_off';
          title = l10n.t("Clear Access Key");
        }
        logout = `<vscode-link title="${title}">
                      <span id="logout" class="material-symbols-rounded" style="font-size: 24px;">${icon}</span>
                    </vscode-link>`;
      }, () => { });
    }

    accountInfo = `
    <div class="flex gap-2 items-center w-full" title="${userId || ""}">
      ${avatarEle}
      <span class="grow font-bold text-base" ${userId ? `title="${userId}"` : ""}>${username || l10n.t("Unknown")}</span>
      ${logout}
    </div>
    `;
    let settingOptions = `<vscode-divider style="border-top: calc(var(--border-width) * 1px) solid var(--panel-view-border);"></vscode-divider>
    <b>${l10n.t("Inline completion")}</b>
    <div class="ml-4">
      <div>
      <vscode-radio-group id="triggerModeRadio" class="flex flex-wrap px-2">
        <label slot="label">${l10n.t("Trigger Mode")}</label>
        <vscode-radio ${autoComplete ? "checked" : ""} class="w-32" value="Auto" title="${l10n.t("Get completion suggestions once stop typing")}">
          ${l10n.t("Auto")}
          <span id="triggerDelay" class="${autoComplete ? "" : "hidden"}">
            <vscode-link id="triggerDelayShortBtn" class="${delay === 1 ? "" : "hidden"}" title="${l10n.t("Short delay")}" style="position: absolute; margin: -2px 4px;">
              <span id="triggerDelayShort" class="material-symbols-rounded">timer</span>
            </vscode-link>
            <vscode-link id="triggerDelayLongBtn" class="${delay !== 1 ? "" : "hidden"}" title="${l10n.t("Delay 3 senconds")}" style="position: absolute; margin: -2px 4px;">
              <span id="triggerDelayLong" class="material-symbols-rounded">timer_3_alt_1</span>
            </vscode-link>
          </span>
        </vscode-radio>
        <vscode-radio ${autoComplete ? "" : "checked"} class="w-32" value="Manual" title="${l10n.t("Get completion suggestions on keyboard event")}">
          ${l10n.t("Manual")}
          <vscode-link href="${Uri.parse(`command:workbench.action.openGlobalKeybindings?${encodeURIComponent(JSON.stringify("raccoon.inlineSuggest.trigger"))}`)}" id="keyBindingBtn" class="${autoComplete ? "hidden" : ""}" title="${l10n.t("Set keyboard shortcut")}" style="position: absolute; margin: -2px 4px;">
            <span class="material-symbols-rounded">keyboard</span>
          </vscode-link>
        </vscode-radio>
      </vscode-radio-group>
      </div>
    </div>
    <div class="ml-4">
    <div>
      <vscode-radio-group id="completionPreferenceRadio" class="flex flex-wrap px-2">
        <label slot="label">${l10n.t("Completion Preference")}</label>
        <vscode-radio ${completionPreference === CompletionPreferenceType.signleLine ? "checked" : ""} class="w-32" value="${CompletionPreferenceType.signleLine}" title="${l10n.t("Single Line")}">
          ${l10n.t("Single Line")}
        </vscode-radio>
        <vscode-radio ${completionPreference === CompletionPreferenceType.balanced ? "checked" : ""} class="w-32" value="${CompletionPreferenceType.balanced}" title="${l10n.t("Balanced")}">
          ${l10n.t("Balanced")}
        </vscode-radio>
        <vscode-radio ${completionPreference === CompletionPreferenceType.bestEffort ? "checked" : ""} class="w-32" value="${CompletionPreferenceType.bestEffort}" title="${l10n.t("Best Effort")}">
          ${l10n.t("Best Effort")}
        </vscode-radio>
      </vscode-radio-group>
    </div>
    </div>
    <div class="ml-4">
    <div>
      <vscode-radio-group id="candidateNumberRadio" class="flex flex-wrap px-2">
        <label slot="label">${l10n.t("Max Candidate Number")}</label>
        <vscode-radio ${candidates === 1 ? "checked" : ""} class="w-32" value="1" title="${l10n.t("Show {0} candidate snippet(s) at most", 1)}">
        ${l10n.t("1 candidate")}
        </vscode-radio>
        <vscode-radio ${candidates === 2 ? "checked" : ""} class="w-32" value="2" title="${l10n.t("Show {0} candidate snippet(s) at most", 2)}">
        ${l10n.t("{0} candidates", 2)}
        </vscode-radio>
        <vscode-radio ${candidates === 3 ? "checked" : ""} class="w-32" value="3" title="${l10n.t("Show {0} candidate snippet(s) at most", 3)}">
        ${l10n.t("{0} candidates", 3)}
        </vscode-radio>
      </vscode-radio-group>
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
    <div class="flex flex-col">
      <vscode-checkbox id="privacy" ${this.context.globalState.get("privacy") ? "checked" : ""}>${l10n.t("Join the User Experience Improvement Program")}</vscode-checkbox>
      <div style="display: flex; align-items: center; gap: 10px; margin: 4px 0;">
        <span class="material-symbols-rounded text-2xl" style="font-size: 18px;margin: 0 -1px;">bug_report</span><span id="report-issue" style="cursor: pointer">${l10n.t("Report issue")}</span>
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
    <div id="settings" class="h-screen select-none flex flex-col gap-2 mx-auto p-4 max-w-xl">
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
          <span class="material-symbols-rounded attach-btn-left" style="padding: 3px; background-color: var(--dropdown-background);" title="${l10n.t("Code engine")}">assistant</span>
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
        case 'listPrompt': {
          this.sendMessage({ type: 'promptList', value: raccoonManager.prompt });
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
          if (!data.code || !data.account || !data.password) {
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
            if (url.startsWith("raccoon://raccoon.search/stackoverflow")) {
              let q = url.replace('${query}', `${encodeURIComponent(JSON.stringify({ "query": data.query }))}`);
              commands.executeCommand('vscode.openWith', Uri.parse(q), RaccoonSearchEditorProvider.viewType);
            } else {
              let q = url.replace('${query}', encodeURIComponent(data.query));
              commands.executeCommand("vscode.open", q);
            }
          }
          break;
        }
        case 'flushLog': {
          if (data.action === 'delete') {
            this.cache.removeCacheItem(data.id);
          } else if (data.action === 'answer') {
            this.cache.appendCacheItem({ id: data.id, name: data.name, timestamp: data.ts, type: CacheItemType.answer, value: data.value });
          } else if (data.action === 'error') {
            this.cache.appendCacheItem({ id: data.id, name: data.name, timestamp: data.ts, type: CacheItemType.error, value: data.value });
          }
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
                let helplink = `<a class="reflink flex items-center gap-2 my-2 p-2 leading-loose rounded" style="background-color: var(--vscode-editorCommentsWidget-rangeActiveBackground);" href="${raccoonDocsUrl}">
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
          this.sendApiRequest(promptInfo, data.values, data.history);
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
        case 'diff': {
          if (data.languageid && data.origin && data.value) {
            diffCode(data.languageid, data.origin, data.value);
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
                  let content: string = data.value;
                  let start = editor.selection.start.line;
                  editor.insertSnippet(new SnippetString(content.trimEnd() + "\n")).then(async (_v) => {
                    await new Promise((f) => setTimeout(f, 200));
                    let end = editor.selection.anchor.line;
                    decorateCodeWithRaccoonLabel(editor, start, end);
                  }, () => { });
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
        case 'triggerMode': {
          if (raccoonManager.autoComplete !== (data.value === "Auto")) {
            raccoonManager.autoComplete = (data.value === "Auto");
            this.updateSettingPage();
          }
          break;
        }
        case 'completionPreference': {
          raccoonManager.completionPreference = data.value;
          break;
        }
        case 'responseMode': {
          if (raccoonManager.streamResponse !== (data.value === "Streaming")) {
            raccoonManager.streamResponse = (data.value === "Streaming");
            this.updateSettingPage();
          }
          break;
        }
        case 'delay': {
          if (data.value !== raccoonManager.delay) {
            raccoonManager.delay = data.value;
            this.updateSettingPage();
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
                commands.executeCommand("keybindings.editor.resetKeybinding", "raccoon.inlineSuggest.trigger");
                HistoryCache.deleteAllCacheFiles(this.context, true);
                FavoriteCodeEditor.deleteSnippetFiles();
                raccoonManager.clear();
              }
            });
          break;
        }
        case 'privacy': {
          this.context.globalState.update("privacy", data.value);
          break;
        }
        case 'addFavorite': {
          commands.executeCommand("vscode.openWith", Uri.parse(`raccoon://raccoon.favorites/${data.id}.raccoon.favorites?${encodeURIComponent(JSON.stringify({ title: `${l10n.t("Favorite Snippet")} [${data.id}]` }))}#${encodeURIComponent(JSON.stringify(data))}`), FavoriteCodeEditor.viweType);
          break;
        }
        case 'telemetry': {
          if (data.info.action === 'bug-report') {
            let issueTitle;
            let issueBody;
            if (data.info.request && data.info.response) {
              issueTitle = '[Feedback]';
              let renderRequestBody = data.info.request.prompt;
              if (renderRequestBody) {
                renderRequestBody = renderRequestBody.replace(/\{\{code\}\}/g, data.info.request.code ? `\`\`\`${data.info.request.languageid || ""}\n${data.info.request.code}\n\`\`\`` : "");
                issueTitle = '[Need Improvement]';
                issueBody = `## Your question\n\n
${renderRequestBody}
${data.info.response[0] ? `\n\n## Raccoon's answer\n\n${data.info.response[0]}\n\n` : ""}
${data.info.error ? `\n\n## Raccoon's error\n\n${data.info.error}\n\n` : ""}
## Your expection
`;
              }
            }
            commands.executeCommand("workbench.action.openIssueReporter", { extensionId: this.context.extension.id, issueTitle, issueBody });
            break;
          }
          if (!env.isTelemetryEnabled) {
            window.showInformationMessage("Thanks for your feedback, Please enable `telemetry.telemetryLevel` to send data to us.", "OK").then((v) => {
              if (v === "OK") {
                commands.executeCommand("workbench.action.openGlobalSettings", { query: "telemetry.telemetryLevel" });
              }
            });
            break;
          }
          let action = data.info.action;
          telemetryReporter.logUsage(action);
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

  public async sendApiRequest(prompt: PromptInfo, values?: any, history?: any[]) {
    let ts = new Date();
    let id = ts.valueOf();
    let reqTimestamp = ts.toLocaleString();

    let loggedin = raccoonManager.isClientLoggedin();
    let username = raccoonManager.username();
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

    let avatar = raccoonManager.avatar();
    let robot = raccoonManager.getActiveClientRobotName();

    if (promptHtml.status === RenderStatus.editRequired) {
      this.sendMessage({ type: 'addQuestion', username, avatar, robot, value: promptHtml, streaming, id, timestamp: reqTimestamp });
    } else {
      this.sendMessage({ type: 'addQuestion', username, avatar, robot, value: promptHtml, streaming, id, timestamp: reqTimestamp });
      try {
        this.stopList[id] = new AbortController();
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
            let aLen = (h.answer.length) * 2 + 12;
            if ((el + aLen) > maxTokens) {
              break;
            }
            el += aLen;
            historyMsgs.push({
              role: Role.assistant,
              content: h.answer
            });
            let qLen = (h.answer.length) * 2 + 12;
            if ((el + qLen) > maxTokens) {
              break;
            }
            el += qLen;
            historyMsgs.push({
              role: Role.user,
              content: h.question
            });
          }
        }
        this.cache.appendCacheItem({ id, name: username, timestamp: reqTimestamp, type: CacheItemType.question, instruction: prompt.label, value: instruction.content });

        historyMsgs = historyMsgs.reverse();
        telemetryReporter.logUsage(prompt.type);
        let msgs = [...historyMsgs, { role: instruction.role, content: raccoonManager.buildFillPrompt(ModelCapacity.assistant, '', instruction.content) || "" }];
        if (streaming) {
          let signal = this.stopList[id].signal;
          raccoonManager.getCompletionsStreaming(
            ModelCapacity.assistant,
            {
              messages: msgs,
              n: 1
            },
            (event) => {
              let rts = new Date().toLocaleString();
              let content: string | undefined = undefined;
              let data = event.data;
              if (data) {
                rts = new Date(data.created).toLocaleString();
              }
              if (data && data.choices && data.choices[0]) {
                content = data.choices[0].message?.content || "";
              }
              switch (event.type) {
                case ResponseEvent.cancel: {
                  delete this.stopList[id];
                  this.sendMessage({ type: 'stopResponse', id });
                  break;
                }
                case ResponseEvent.finish:
                case ResponseEvent.data: {
                  if (content) {
                    this.sendMessage({ type: 'addResponse', id, value: content, timestamp: rts });
                  }
                  break;
                }
                case ResponseEvent.error: {
                  if (content === "Authentication expired") {
                    raccoonManager.getAuthUrlLogin().then((url) => {
                      this.sendMessage({ type: 'reLogin', message: l10n.t("Authentication expired, please login again"), url, id, timestamp: rts });
                    });
                  } else if (content === 'canceled') {
                    this.sendMessage({ type: 'stopResponse', id });
                  } else if (content?.includes('maximum context length limit')) {
                    this.sendMessage({ type: 'addError', error: l10n.t("Too many tokens"), id, timestamp: rts });
                  } else {
                    this.sendMessage({ type: 'addError', error: content || "", id, timestamp: rts });
                  }
                  break;
                }
                case ResponseEvent.done: {
                  this.sendMessage({ type: 'stopResponse', id });
                  break;
                }
              }
            },
            {
              headers: buildHeader(this.context.extension, prompt.type, `${id}`),
              signal
            }
          );
        } else {
          await raccoonManager.getCompletions(
            ModelCapacity.assistant,
            {
              messages: msgs,
              n: 1
            },
            {
              headers: buildHeader(this.context.extension, prompt.type, `${id}`),
              signal: this.stopList[id].signal
            })
            .then(rs => {
              let content = rs.choices[0]?.message?.content || "";
              let stopReason = rs.choices[0]?.finishReason;
              let rts = new Date(rs.created).toLocaleString();
              outlog.debug(content + (stopReason ? `\n<StopReason: ${stopReason}>` : ""));
              if (stopReason !== 'length' && stopReason !== 'stop') {
                this.sendMessage({ type: 'addError', error: stopReason, id, timestamp: rts });
              } else {
                this.sendMessage({ type: 'addResponse', id, value: content, timestamp: rts });
              }
              this.sendMessage({ type: 'stopResponse', id });
            }, (err) => {
              let error = err.response?.statusText || err.message;
              if (err.response?.data?.error?.message) {
                error = err.response.data.error.message;
              }
              let rts = new Date().toLocaleString();
              if (error === "Authentication expired") {
                raccoonManager.getAuthUrlLogin().then((url) => {
                  this.sendMessage({ type: 'reLogin', message: l10n.t("Authentication expired, please login again"), url, id, timestamp: rts });
                });
              } else {
                this.sendMessage({ type: 'addError', error, id, timestamp: rts });
              }
              this.sendMessage({ type: 'stopResponse', id });
            });
        }
      } catch (err: any) {
        if (err.message === "canceled") {
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

  public async clear() {
    for (let id in this.stopList) {
      this.stopList[id].abort();
    }
    this.cache = new HistoryCache(this.context, `${env.sessionId}-${new Date().valueOf()}`);
    this.sendMessage({ type: "clear" });
    this.showWelcome();
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
                .raccoon-avatar {
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
                    <vscode-checkbox class="px-2 py-1 m-0" checked title='Search in StackOverflow' data-query='raccoon://raccoon.search/stackoverflow.search?\${query}'>
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
                      <div class="history-hint  items-center" style="margin-left: 1rem;">
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
                          data-tip="${l10n.t("Ask Raccoon a question") + ", " + l10n.t("or type '/' for prompts")}"
                          data-tip1="${l10n.t("Type [Shift + Enter] to start a new line")}"
                          data-tip2="${l10n.t("Press [Esc] to stop responding")}"
                          data-tip3="${l10n.t("Press ↑/↓ key to recall history")}"
                          data-tip4="${l10n.t("Type ? to tigger search")}"
                          data-tip5="${l10n.t("Clear button can be found on the top of this view")}"
                    >
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
    context.subscriptions.push(
      commands.registerCommand("raccoon.settings", async () => {
        raccoonManager.update();
        commands.executeCommand('raccoon.view.focus').then(() => {
          return RaccoonViewProvider.editor?.updateSettingPage("toggle");
        });
      })
    );
    context.subscriptions.push(
      commands.registerCommand("raccoon.new-chat", async (uri) => {
        if (!uri) {
          RaccoonViewProvider.editor?.clear();
        } else {
          let editor = RaccoonEditorProvider.getEditor(uri);
          editor?.clear();
        }
      })
    );
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
    commands.executeCommand('raccoon.view.focus');
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
