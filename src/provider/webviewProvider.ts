import { window, workspace, WebviewViewProvider, TabInputText, TabInputNotebook, WebviewView, ExtensionContext, WebviewViewResolveContext, CancellationToken, SnippetString, commands, Webview, Uri, l10n, ViewColumn, env, ProgressLocation, TextEditor, Disposable, TextDocument } from 'vscode';
import { sensecodeManager, outlog, telemetryReporter } from '../extension';
import { PromptInfo, PromptType, RenderStatus, SenseCodePrompt } from "./promptTemplates";
import { getDocumentLanguage } from '../utils/getDocumentLanguage';
import { SenseCodeEditorProvider } from './assitantEditorProvider';
import { BanWords } from '../utils/swords';
import { CompletionPreferenceType } from './sensecodeManager';
import { Message, ResponseEvent, Role } from '../sensecodeClient/src/CodeClient';
import { decorateCodeWithSenseCodeLabel } from '../utils/decorateCode';
import { buildHeader } from '../utils/buildRequestHeader';

const encoder = new TextEncoder();
const decoder = new TextDecoder();

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
      `;

interface CacheItem {
  id: number;
  timestamp: string;
  name: string;
  question?: string;
  answer?: string;
  error?: string;
}

async function appendCacheItem(context: ExtensionContext, cacheFile: string, data?: CacheItem): Promise<void> {
  let cacheDir = Uri.joinPath(context.globalStorageUri, 'cache');
  let cacheUri = Uri.joinPath(cacheDir, cacheFile);
  return workspace.fs.stat(cacheDir)
    .then(() => {
      return workspace.fs.stat(cacheUri)
        .then(() => {
          if (!data) {
            return;
          }
          workspace.fs.readFile(cacheUri).then(content => {
            let items: Array<any> = JSON.parse(decoder.decode(content) || "[]");
            if (items) {
              workspace.fs.writeFile(cacheUri, new Uint8Array(encoder.encode(JSON.stringify([...items, data], undefined, 2))));
            } else {
              workspace.fs.writeFile(cacheUri, new Uint8Array(encoder.encode(JSON.stringify([data], undefined, 2))));
            }
          });
        }, () => {
          return workspace.fs.writeFile(cacheUri, new Uint8Array(encoder.encode(JSON.stringify(data ? [data] : []))));
        });
    }, async () => {
      return workspace.fs.createDirectory(cacheDir)
        .then(() => {
          return workspace.fs.writeFile(cacheUri, new Uint8Array(encoder.encode(JSON.stringify(data ? [data] : []))));
        });
    });
}

async function getCacheItems(context: ExtensionContext, cacheFile: string): Promise<Array<CacheItem>> {
  let cacheDir = Uri.joinPath(context.globalStorageUri, 'cache');
  let cacheUri = Uri.joinPath(cacheDir, cacheFile);
  return workspace.fs.readFile(cacheUri).then(content => {
    return JSON.parse(decoder.decode(content) || "[]");
  });
}

async function removeCacheItem(context: ExtensionContext, cacheFile: string, id?: number): Promise<void> {
  let cacheDir = Uri.joinPath(context.globalStorageUri, 'cache');
  let cacheUri = Uri.joinPath(cacheDir, cacheFile);
  return workspace.fs.readFile(cacheUri).then(content => {
    if (id) {
      let items: Array<any> = JSON.parse(decoder.decode(content) || "[]");
      let log = items.filter((v, _idx, _arr) => {
        return v.id !== id;
      });
      return workspace.fs.writeFile(cacheUri, new Uint8Array(encoder.encode(JSON.stringify(log, undefined, 2))));
    } else {
      return workspace.fs.writeFile(cacheUri, new Uint8Array(encoder.encode('[]')));
    }
  });
}

export async function deleteAllCacheFiles(context: ExtensionContext): Promise<void> {
  let cacheDir = Uri.joinPath(context.globalStorageUri, 'cache');
  return workspace.fs.stat(cacheDir)
    .then(() => {
      workspace.fs.delete(cacheDir, { recursive: true });
    });
}

export class SenseCodeEditor extends Disposable {
  private stopList: { [key: number]: AbortController };
  private lastTextEditor?: TextEditor;
  private banWords: BanWords = BanWords.getInstance();

  private isSupportedScheme(d: TextDocument) {
    return (d.uri.scheme === "file" || d.uri.scheme === "git" || d.uri.scheme === "untitled" || d.uri.scheme === "vscode-userdata");
  }

  constructor(private context: ExtensionContext, private webview: Webview, private readonly cacheFile: string) {
    super(() => { });
    appendCacheItem(context, cacheFile);
    this.stopList = {};
    this.lastTextEditor = window.activeTextEditor;
    context.subscriptions.push(
      workspace.onDidChangeConfiguration(async (e) => {
        if (e.affectsConfiguration("SenseCode")) {
          sensecodeManager.update();
          if (e.affectsConfiguration("SenseCode.Prompt")) {
            this.sendMessage({ type: 'promptList', value: sensecodeManager.prompt });
          }
          if (e.affectsConfiguration("SenseCode.Engines")) {
            await sensecodeManager.updateEngineList();
            this.updateSettingPage("full");
          }
        }
      })
    );
    context.subscriptions.push(
      context.secrets.onDidChange(async (e) => {
        if (e.key === "SenseCode.tokens") {
          let refreshing = this.context.globalState.get("SenseCode.tokenRefreshed");
          if (refreshing) {
          } else {
            this.showWelcome();
          }
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
          if (e && this.checkCodeReady(e)) {
            this.sendMessage({ type: 'codeReady', value: true, file: e.document.uri.toString(), range: e.selections[0] });
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
              this.sendMessage({ type: 'codeReady', value: true, file: doc.uri.toString(), range: e.selections[0] });
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
    sensecodeManager.update();
    this.sendMessage({ type: 'updateSettingPage', action: "close" });
    let helpLink = `
    <div class="flex items-center gap-2 m-2 p-2 leading-loose rounded" style="background-color: var(--vscode-editorCommentsWidget-rangeActiveBackground);">
      <span class="material-symbols-rounded">question_mark</span>
      <div class="inline-block leading-loose">${l10n.t("Read SenseCode document for more information")}</div>
      <div class="flex grow justify-end">
        <vscode-link href="vscode:extension/${this.context.extension.id}"><span class="material-symbols-rounded">keyboard_double_arrow_right</span></vscode-link>
      </div>
    </div>`;
    let ts = new Date();
    let timestamp = ts.toLocaleString();
    let detail = full ? (guide + helpLink) : '';
    let name = sensecodeManager.username();
    let category = "welcome" + (full ? "-full" : "");
    let username = '';
    let robot = sensecodeManager.getActiveClientLabel() || "SenseCode";
    if (name) {
      username = ` @${name}`;
    } else {
      const loginHint = `<div class="flex items-center gap-2 m-2 p-2 leading-loose rounded" style="background-color: var(--vscode-editorCommentsWidget-rangeActiveBackground);">
            <span class='material-symbols-rounded'>priority_high</span>
            <div class='inline-block leading-loose'>
              ${l10n.t("It seems that you have not had an account to <b>{0}</b>, please <b>login</b> in settings first.", robot)}
            </div>
            <div class="flex grow justify-end">
              <vscode-link href="${Uri.parse(`command:sensecode.settings`)}"><span class="material-symbols-rounded">settings</span></vscode-link>
            </div>
          </div>`;
      detail += loginHint;
    }
    let welcomMsg = l10n.t("Welcome<b>{0}</b>, I'm <b>{1}</b>, your code assistant. You can ask me to help you with your code, or ask me any technical question.", username, robot);
    this.sendMessage({ type: 'addMessage', category, username, robot, value: welcomMsg + detail, timestamp });
  }

  private async restoreFromCache() {
    return getCacheItems(this.context, this.cacheFile).then((items: Array<CacheItem>) => {
      if (items.length > 0) {
        this.sendMessage({ type: 'restoreFromCache', value: items });
        this.showWelcome();
      }
    });
  }

  dispose() {
    for (let s in this.stopList) {
      this.stopList[s].abort();
    }
  }

  async updateSettingPage(action?: string): Promise<void> {
    let autoComplete = sensecodeManager.autoComplete;
    let completionPreference = sensecodeManager.completionPreference;
    let streamResponse = sensecodeManager.streamResponse;
    let delay = sensecodeManager.delay;
    let candidates = sensecodeManager.candidates;
    let setPromptUri = Uri.parse(`command:workbench.action.openGlobalSettings?${encodeURIComponent(JSON.stringify({ query: "SenseCode.Prompt" }))}`);
    let setEngineUri = Uri.parse(`command:workbench.action.openGlobalSettings?${encodeURIComponent(JSON.stringify({ query: "SenseCode.Engines" }))}`);
    let esList = `<vscode-dropdown id="engineDropdown" class="w-full" value="${sensecodeManager.getActiveClientLabel()}">`;
    let es = sensecodeManager.clientsLabel;
    for (let label of es) {
      esList += `<vscode-option value="${label}">${label}</vscode-option>`;
    }
    esList += "</vscode-dropdown>";
    let username: string | undefined = undefined;
    let avatarEle = `<span class="material-symbols-rounded" style="font-size: 40px; font-variation-settings: 'opsz' 48;">person_pin</span>`;
    let loginout = ``;
    if (!sensecodeManager.isClientLoggedin()) {
      await sensecodeManager.getAuthUrlLogin().then(authUrl => {
        if (!authUrl) {
          return;
        }
        let url = Uri.parse(authUrl);
        let title;
        let icon = 'login';
        if (url.scheme === "command") {
          icon = 'key';
          title = l10n.t("Setup Access Key");
        } else if (url.authority) {
          title = `${l10n.t("Login")} [${url.authority ?? authUrl}]`;
        } else {
          title = `${l10n.t("Login")} [${authUrl}]`;
        }
        loginout = `<vscode-link class="justify-end" title="${title}" href="${url.toString(true)}">
                        <span class="material-symbols-rounded px-1" style="font-size: 24px;">${icon}</span>
                      </vscode-link>`;
      }, () => { });
    } else {
      username = sensecodeManager.username();
      let avatar = sensecodeManager.avatar();
      if (avatar) {
        avatarEle = `<img class="w-10 h-10 rounded-full" src="${avatar}" />`;
      }
      await sensecodeManager.getAuthUrlLogin().then(authUrl => {
        if (!authUrl) {
          return;
        }
        let url = Uri.parse(authUrl);
        let title = l10n.t("Logout");
        let icon = 'logout';
        if (url.scheme === "command") {
          icon = 'key_off';
          title = l10n.t("Clear Access Key");
        }
        loginout = `<vscode-link class="justify-end" title="${title}">
                      <span id="logout" class="material-symbols-rounded px-1" style="font-size: 24px;">${icon}</span>
                    </vscode-link>`;
      }, () => { });
    }
    let accountInfo = `
        <div class="flex gap-2 items-center w-full">
          ${avatarEle}
          <span class="grow font-bold text-base">${username || l10n.t("Unknown")}</span>
          ${loginout}
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
      <div class="ml-4">
      <div>
        <vscode-radio-group id="completionPreferenceRadio" class="flex flex-wrap px-2">
          <label slot="label">${l10n.t("Completion Preference")}</label>
          <vscode-radio ${completionPreference === CompletionPreferenceType.speedPriority ? "checked" : ""} class="w-32" value="${CompletionPreferenceType.speedPriority}" title="${l10n.t("Speed Priority")}">
            ${l10n.t("Speed Priority")}
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
      <b>${l10n.t("Advanced")}</b>
      <div class="ml-4">
        <div class="flex flex-row my-2 px-2 gap-2 items-center">
          <span>${l10n.t("Custom prompt")}</span>
          <vscode-link href="${setPromptUri}" style="margin: -1px 0;"><span class="material-symbols-rounded">auto_fix</span></vscode-link>
        </div>
      </div>
      <div class="ml-4">
        <div class="flex flex-row my-2 px-2 gap-2 items-center">
          <span>${l10n.t("Clear cache files")}</span>
          <vscode-link style="margin: -1px 0;"><span id="clearCacheFiles" class="material-symbols-rounded">delete</span></vscode-link>
        </div>
      </div>
      <vscode-divider style="border-top: calc(var(--border-width) * 1px) solid var(--panel-view-border);"></vscode-divider>
      <vscode-button id="clearAll" class="mx-2 self-center w-60">
        ${l10n.t("Clear all settings")}
        <span slot="start" class="material-symbols-rounded">settings_power</span>
      </vscode-button>
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
          await this.restoreFromCache();
          break;
        }
        case 'listPrompt': {
          this.sendMessage({ type: 'promptList', value: sensecodeManager.prompt });
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
        case 'searchQuery': {
          this.sendMessage({ type: 'addSearch', value: '?' + data.query });
          for (let url of data.searchUrl) {
            let q = url.replace('${query}', encodeURIComponent(data.query));
            commands.executeCommand("vscode.open", q);
          }
          break;
        }
        case 'flushLog': {
          if (data.action === 'delete') {
            removeCacheItem(this.context, this.cacheFile, data.id);
          } else if (data.action === 'answer') {
            appendCacheItem(this.context, this.cacheFile, { id: data.id, name: data.name, timestamp: data.ts, answer: data.value });
          } else if (data.action === 'error') {
            appendCacheItem(this.context, this.cacheFile, { id: data.id, name: data.name, timestamp: data.ts, error: data.value });
          }
          break;
        }
        case 'sendQuestion': {
          let editor = this.lastTextEditor;
          if (window.activeTextEditor && this.isSupportedScheme(window.activeTextEditor.document)) {
            editor = window.activeTextEditor;
          }
          let prompt: SenseCodePrompt = data.prompt;
          if (editor && !data.values) {
            prompt.code = editor.document.getText(editor.selection);
            if (editor.document.languageId !== "plaintext") {
              prompt.languageid = editor.document.languageId;
            }
          }
          if (prompt.type === PromptType.freeChat) {
            if (prompt.code && !prompt.message.content.includes("{code}")) {
              prompt.message.content += "\n{code}\n";
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
                    decorateCodeWithSenseCodeLabel(editor, start, end);
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
        case 'openNew': {
          const document = await workspace.openTextDocument({
            content: data.value,
            language: data.language
          });
          window.showTextDocument(document);
          break;
        }
        case 'activeEngine': {
          sensecodeManager.setActiveClient(data.value);
          this.updateSettingPage("full");
          this.showWelcome();
          break;
        }
        case 'logout': {
          let ae = sensecodeManager.getActiveClientLabel() || "SenseCode";
          window.showWarningMessage(
            l10n.t("Logout from {0}?", ae),
            { modal: true },
            l10n.t("OK"))
            .then((v) => {
              if (v === l10n.t("OK")) {
                sensecodeManager.logout();
              }
            });
          break;
        }
        case 'triggerMode': {
          if (sensecodeManager.autoComplete !== (data.value === "Auto")) {
            sensecodeManager.autoComplete = (data.value === "Auto");
            this.updateSettingPage();
          }
          break;
        }
        case 'completionPreference': {
          sensecodeManager.completionPreference = data.value;
          break;
        }
        case 'responseMode': {
          if (sensecodeManager.streamResponse !== (data.value === "Streaming")) {
            sensecodeManager.streamResponse = (data.value === "Streaming");
            this.updateSettingPage();
          }
          break;
        }
        case 'delay': {
          if (data.value !== sensecodeManager.delay) {
            sensecodeManager.delay = data.value;
            this.updateSettingPage();
          }
          break;
        }
        case 'candidates': {
          if (data.value <= 0) {
            data.value = 1;
          }
          sensecodeManager.candidates = data.value;
          break;
        }
        case 'clearCacheFiles': {
          window.withProgress({
            location: { viewId: "sensecode.view" }
          }, async (progress, _cancel) => {
            return deleteAllCacheFiles(this.context).then(() => {
              progress.report({ increment: 100 });
              this.sendMessage({ type: 'showInfoTip', style: "message", category: 'clear-cache-done', value: l10n.t("Clear cache files done"), id: new Date().valueOf() });
            }, () => {
              progress.report({ increment: 100 });
              this.sendMessage({ type: 'showInfoTip', style: "error", category: 'clear-cache-fail', value: l10n.t("Clear cache files failed"), id: new Date().valueOf() });
            });
          });
          break;
        }
        case 'clearAll': {
          window.showWarningMessage(
            l10n.t("Clear all settings?"),
            { modal: true, detail: l10n.t("It will clear all settings, and log out all your accounts.") },
            l10n.t("OK"))
            .then(v => {
              if (v === l10n.t("OK")) {
                commands.executeCommand("keybindings.editor.resetKeybinding", "sensecode.inlineSuggest.trigger");
                sensecodeManager.clear();
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
          let panel = window.createWebviewPanel("sensecode.correction", `Code Correction-${data.info.generate_at}`, ViewColumn.Active, { enableScripts: true });
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
          let renderRequestBody = data.info.request.prompt;
          let lang = getDocumentLanguage(data.info.request.languageid);
          renderRequestBody = renderRequestBody.replace("{code}", data.info.request.code ? `\`\`\`${data.info.request.languageid || ""}\n${data.info.request.code}\n\`\`\`` : "");

          let content = `
# Sincerely apologize for any inconvenience

SenseCode is still under development. Questions, patches, improvement suggestions and reviews welcome, we always looking forward to your feedback.

## Request

${renderRequestBody}

## SenseCode response

${data.info.response}

## Your solution
`;

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
                "language": "${data.info.request.languageid}",
                "code": document.getElementById("correction").value
              }
            )
          }
          window.onload = (event) => {
            var info = document.getElementById("info");
            const content = new DOMParser().parseFromString(marked.parse(info.textContent), "text/html");
            info.innerHTML = content.documentElement.innerHTML;
          };
          </script>
          </head>
          <body>
          <div class="markdown-body" style="margin: 1rem 4rem;">
            <div id="info">${content}</div>
              <div style="display: flex;flex-direction: column;">
                <vscode-text-area id="correction" rows="20" resize="vertical" placeholder="Write your brilliant ${lang ? lang + " code" : "anwser"} here..." style="margin: 1rem 0; font-family: var(--vscode-editor-font-family);"></vscode-text-area>
                <vscode-button button onclick="send()" style="--button-padding-horizontal: 2rem;align-self: flex-end;width: fit-content;">Feedback</vscode-button>
              </div>
            </div>
          </body>
          </html>`;
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

    const editor = window.activeTextEditor || this.lastTextEditor;
    if (editor && this.checkCodeReady(editor)) {
      setTimeout(() => {
        this.sendMessage({ type: 'codeReady', value: true, file: editor.document.uri.toString(), range: editor.selections[0] });
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
    let timestamp = ts.toLocaleString();

    let loggedin = sensecodeManager.isClientLoggedin();
    if (!loggedin) {
      //this.sendMessage({ type: 'addMessage', category: "no-account", value: loginHint });
      this.sendMessage({ type: 'showInfoTip', style: "error", category: 'unauthorized', value: l10n.t("Unauthorized"), id });
      return;
    }

    let streaming = sensecodeManager.streamResponse;
    let instruction = prompt.prompt;
    if (this.banWords.checkBanWords([instruction.content, prompt.codeInfo?.code ?? ""])) {
      this.sendMessage({ type: 'showInfoTip', style: "error", category: 'illegal-instruction', value: l10n.t("Incomprehensible Question"), id });
      return;
    }

    let promptHtml = prompt.generatePromptHtml(id, values);
    if (promptHtml.status === RenderStatus.codeMissing) {
      this.sendMessage({ type: 'showInfoTip', style: "error", category: 'no-code', value: l10n.t("No code selected"), id });
      return;
    }
    let el = (instruction.content.length * 2) + (promptHtml.prompt.code?.length ? promptHtml.prompt.code.length / 3 : 0);
    let maxTokens = sensecodeManager.maxToken();
    if (el > maxTokens) {
      this.sendMessage({ type: 'showInfoTip', style: "error", category: 'too-many-tokens', value: l10n.t("Too many tokens"), id });
      return;
    }

    let username = sensecodeManager.username() || "User";
    let avatar = sensecodeManager.avatar();
    let robot = sensecodeManager.getActiveClientLabel();
    this.sendMessage({ type: 'addQuestion', username, avatar, robot, value: promptHtml, streaming, id, timestamp });

    if (promptHtml.status === RenderStatus.resolved) {
      try {
        this.stopList[id] = new AbortController();
        if (promptHtml.prompt.code) {
          let codeBlock = `\n\`\`\`${promptHtml.prompt.languageid || ""}\n${promptHtml.prompt.code}\n\`\`\``;
          instruction.content = instruction.content.replace("{code}",
            () => {
              return codeBlock;
            });
        } else {
          instruction.content = instruction.content.replace("{code}", "");
        }
        let historyMsgs: Message[] = [];
        if (history) {
          let hs = Array.from(history).reverse();
          for (let h of hs) {
            let qaLen = (h.question.length + h.answer.length) * 2 + 12;
            if ((el + qaLen) > maxTokens) {
              break;
            }
            el += qaLen;
            historyMsgs.push({
              role: Role.assistant,
              content: h.answer
            });
            historyMsgs.push({
              role: Role.user,
              content: h.question
            });
          }
        }
        appendCacheItem(this.context, this.cacheFile, { id, name: username, timestamp: timestamp, question: instruction.content });
        historyMsgs = historyMsgs.reverse();
        let msgs = [{ role: Role.system, content: '' }, ...historyMsgs, instruction];
        if (streaming) {
          let signal = this.stopList[id].signal;
          sensecodeManager.getCompletionsStreaming(
            {
              messages: msgs,
              n: 1,
              maxTokens: sensecodeManager.maxToken(),
              stop: ["<|end|>"]
            },
            (event) => {
              let rts = new Date().toLocaleString();
              let content: string | undefined = undefined;
              let data = event.data;
              if (data && data.created) {
                rts = new Date(data.created).toLocaleString();
              }
              if (data && data.choices && data.choices[0]) {
                content = data.choices[0].message.content;
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
                  this.sendMessage({ type: 'addError', error: content || "", id, timestamp: rts });
                  break;
                }
                case ResponseEvent.done: {
                  this.sendMessage({ type: 'stopResponse', id });
                  break;
                }
              }
            },
            {
              headers: buildHeader(this.context.extension, username, prompt.type),
              signal
            }
          );
        } else {
          await sensecodeManager.getCompletions(
            {
              messages: msgs,
              n: 1,
              maxTokens: sensecodeManager.maxToken(),
              stop: ["<|end|>"]
            },
            {
              headers: buildHeader(this.context.extension, username, prompt.type),
              signal: this.stopList[id].signal
            })
            .then(rs => {
              let content = rs.choices[0]?.message.content || "";
              let stopReason = rs.choices[0]?.finishReason;
              outlog.debug(content + (stopReason ? `\n<StopReason: ${stopReason}>` : ""));
              this.sendMessage({ type: 'addResponse', id, value: content, timestamp: new Date(rs.created).toLocaleString() });
              this.sendMessage({ type: 'stopResponse', id });
            }, (err) => {
              this.sendMessage({ type: 'addError', error: err.response.statusText, id, timestamp: new Date().toLocaleString() });
              this.sendMessage({ type: 'stopResponse', id });
            });
        }
      } catch (err: any) {
        if (err.message === "canceled") {
          delete this.stopList[id];
          this.sendMessage({ type: 'stopResponse', id });
          return;
        }
        let errInfo = err.response?.statusText || err.message || err.response.data.error;
        outlog.error(errInfo);
        this.sendMessage({ type: 'addError', error: errInfo, id });
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
                <div id="msg-wrapper">
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
                  <div id="question" class="w-full flex justify-center items-center">
                    <span class="material-symbols-rounded opacity-40 history-icon">
                      history
                    </span>
                    <div class="op-hint">
                      <div class="history-hint">
                        <span class="material-symbols-rounded">keyboard_return</span> Enter ${l10n.t("Send")}
                      </div>
                      <div class="history-hint">
                        <span class="material-symbols-rounded">keyboard_tab</span> Tab ${l10n.t("Revise")}
                      </div>
                      <div class="history-hint">
                      <span class="material-symbols-rounded">first_page</span> Esc ${l10n.t("Clear")}
                      </div>
                      <div id="code-hint" title="${l10n.t("Code attached")}">
                        <span class="material-symbols-rounded">data_object</span>
                      </div>
                    </div>
                    <label id="question-sizer" data-value
                          data-placeholder="${l10n.t("Ask SenseCode a question") + ", " + l10n.t("or type '/' for prompts")}"
                          data-placeholder-short="${l10n.t("Ask SenseCode a question")}"
                          data-hint="${l10n.t("Pick one prompt to send")} [Enter]"
                          data-tip="${l10n.t("Ask SenseCode a question") + ", " + l10n.t("or type '/' for prompts")}"
                          data-tip1="${l10n.t("Type ? to tigger search")}"
                          data-tip2="${l10n.t("Press ↑/↓ key to recall history")}"
                          data-tip3="${l10n.t("Type [Shift + Enter] to start a new line")}"
                          data-tip4="${l10n.t("Clear button can be found on the top of this view")}"
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
                  "Question": "${l10n.t("Question")}",
                  "Cancel": "${l10n.t("Cancel")}",
                  "Delete": "${l10n.t("Delete this chat entity")}",
                  "Send": "${l10n.t("Send")}",
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
  private static editor?: SenseCodeEditor;
  private static webviewView?: WebviewView;
  constructor(private context: ExtensionContext) {
    context.subscriptions.push(
      commands.registerCommand("sensecode.settings", async () => {
        sensecodeManager.update();
        commands.executeCommand('sensecode.view.focus').then(() => {
          return SenseCodeViewProvider.editor?.updateSettingPage("toogle");
        });
      })
    );
    context.subscriptions.push(
      commands.registerCommand("sensecode.clear", async (uri) => {
        if (!uri) {
          SenseCodeViewProvider.editor?.clear();
        } else {
          let editor = SenseCodeEditorProvider.getEditor(uri);
          editor?.clear();
        }
      })
    );
  }

  public static showError(msg: string) {
    SenseCodeViewProvider.editor?.sendMessage({ type: 'showInfoTip', style: 'error', category: 'custom', value: msg, id: new Date().valueOf() });
  }

  public resolveWebviewView(
    webviewView: WebviewView,
    _context: WebviewViewResolveContext,
    _token: CancellationToken,
  ) {
    SenseCodeViewProvider.editor = new SenseCodeEditor(this.context, webviewView.webview, `sensecode-sidebar.json`);
    SenseCodeViewProvider.webviewView = webviewView;
    webviewView.onDidChangeVisibility(() => {
      if (!webviewView.visible) {
        SenseCodeViewProvider.editor?.sendMessage({ type: 'updateSettingPage', action: "close" });
      }
    });
    webviewView.onDidDispose(() => {
      SenseCodeViewProvider.editor?.sendMessage({ type: 'updateSettingPage', action: "close" });
      SenseCodeViewProvider.editor?.dispose();
      SenseCodeViewProvider.webviewView = undefined;
    });
  }

  public static isVisible() {
    return SenseCodeViewProvider.webviewView?.visible;
  }

  public static async ask(prompt?: PromptInfo) {
    commands.executeCommand('sensecode.view.focus');
    while (!SenseCodeViewProvider.editor) {
      await new Promise((f) => setTimeout(f, 1000));
    }
    if (SenseCodeViewProvider.editor) {
      if (prompt) {
        return SenseCodeViewProvider.editor.sendApiRequest(prompt);
      } else {
        await new Promise((f) => setTimeout(f, 300));
        SenseCodeViewProvider.editor?.sendMessage({ type: 'focus' });
      }
    }
  }
}
