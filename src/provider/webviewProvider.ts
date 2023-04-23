import { IncomingMessage } from 'http';
import { window, workspace, WebviewViewProvider, WebviewView, ExtensionContext, WebviewViewResolveContext, CancellationToken, SnippetString, commands, Webview, Uri, l10n } from 'vscode';
import { configuration, outlog, telemetryReporter } from '../extension';
import { Engine, Prompt } from '../param/configures';
import { GetCodeCompletions, getCodeCompletions } from "../utils/getCodeCompletions";

export class SenseCodeViewProvider implements WebviewViewProvider {
  private webView?: WebviewView;
  private stopList: number[];

  constructor(private context: ExtensionContext) {
    this.stopList = [];
    context.subscriptions.push(
      workspace.onDidChangeConfiguration((e) => {
        if (e.affectsConfiguration("SenseCode")) {
          configuration.update();
          if (e.affectsConfiguration("SenseCode.Prompt")) {
            this.sendMessage({ type: 'promptList', value: configuration.prompt });
          }
          this.updateSettingPage(false);
        }
      })
    );
    context.subscriptions.push(
      context.secrets.onDidChange((e) => {
        if (e.key === "sensecode.token") {
          this.updateSettingPage(false);
        }
      })
    );
    context.subscriptions.push(
      window.onDidChangeTextEditorSelection(e => {
        if (e.textEditor.document.uri.scheme === "file" || e.textEditor.document.uri.scheme === "untitled") {
          this.sendMessage({ type: 'enableAsk', value: (e.selections[0] && !e.selections[0].isEmpty) ? true : false });
        }
      })
    );
  }

  async updateSettingPage(toggle: boolean): Promise<void> {
    let activeEngine = configuration.activeEngine;
    let autoComplete = configuration.autoComplete;
    let streamResponse = configuration.streamResponse;
    let printOut = configuration.printOut;
    let delay = configuration.delay;
    let candidates = configuration.candidates;
    let setPromptUri = Uri.parse(`command:workbench.action.openGlobalSettings?${encodeURIComponent(JSON.stringify({ query: "SenseCode.Prompt" }))}`);
    let setEngineUri = Uri.parse(`command:workbench.action.openGlobalSettings?${encodeURIComponent(JSON.stringify({ query: "SenseCode.Engines" }))}`);
    let es = configuration.engines;
    let esList = `<vscode-dropdown id="engineDropdown" class="w-full" ${activeEngine ? `value="${activeEngine.label}"` : ""}>`;
    for (let e of es) {
      esList += `<vscode-option value="${e.label}">${e.label}</vscode-option>`;
    }
    esList += "</vscode-dropdown>";
    let key = activeEngine ? (activeEngine.key || await configuration.getApiKey(activeEngine)) : undefined;
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
      if (activeEngine?.key) {
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
            <vscode-link class="attach-btn-right" style="padding: 0 3px;" title="${l10n.t("Clear API Key from Secret Storage")}">
              <span id="clearKey" class="material-symbols-rounded">key_off</span>
            </vscode-link>
          </span>`;
      }
    }
    let settingPage = `
    <div id="settings" class="h-screen flex flex-col gap-2 mx-auto p-4 max-w-sm">
      <h3 class="flex flex-row justify-between text-base font-bold">
        ${l10n.t("Settings")}
        <div>
          <span id="close-settings" class="cursor-pointer material-symbols-rounded" onclick="document.getElementById('settings').remove();">close</span>
        </div>
      </h3>
      <vscode-divider style="border-top: calc(var(--border-width) * 1px) solid var(--panel-view-border);"></vscode-divider>
      <b>${l10n.t("Service")}</b>
      <div class="flex flex-col ml-4 my-2 px-2 gap-2">
        <p>${l10n.t("Code engine")}</p>
        <div class="flex flex-row">
          ${esList}
          <vscode-link href="${setEngineUri}" class="pt-px attach-btn-right" title="${l10n.t("Settings")}">
            <span class="material-symbols-rounded">tune</span>
          </vscode-link>
        </div>
      </div>
      <div class="ml-4">
        <div class="flex flex-col grow my-2 px-2 gap-2">
          <span>${l10n.t("API Key")}
          </span>
          ${keycfg}
        </div>
      </div>
      <vscode-divider style="border-top: calc(var(--border-width) * 1px) solid var(--panel-view-border);"></vscode-divider>
      <b>${l10n.t("Inline completion")}</b>
      <div class="ml-4">
        <div>
        <vscode-radio-group id="triggerModeRadio" class="flex flex-wrap px-2">
          <label slot="label">${l10n.t("Trigger Mode")}</label>
          <vscode-radio ${autoComplete ? "" : "checked"} class="w-32" value="Manual" title="${l10n.t("Get completion suggestions on keyboard event")}">
            ${l10n.t("Manual")}
            <vscode-link href="${Uri.parse(`command:workbench.action.openGlobalKeybindings?${encodeURIComponent(JSON.stringify("sensecode.inlineSuggest.trigger"))}`)}" id="keyBindingBtn" class="${autoComplete ? "hidden" : ""}" style="margin: -4px 0;" title="${l10n.t("Set keyboard shortcut")}">
              <span class="material-symbols-rounded">keyboard</span>
            </vscode-link>
          </vscode-radio>
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
        </vscode-radio-group>
        </div>
      </div>
      <div class="ml-4">
        <div>
        <vscode-radio-group id="completionModeRadio" class="flex flex-wrap px-2">
          <label slot="label">${l10n.t("Completion Mode")}</label>
          <vscode-radio ${printOut ? "" : "checked"} class="w-32" value="Snippets" title="${l10n.t("Show completion suggestions as inline completion snippets")}">
            ${l10n.t("Snippets")}
            <span id="candidatesBtn" class="${printOut ? "hidden" : ""}">
              <vscode-link style="margin: -4px 0;" title="${l10n.t("Show {0} candidate snippet(s)", candidates)}">
                <span id="candidates" class="material-symbols-rounded" data-value=${candidates}>${candidates === 1 ? "looks_one" : `filter_${candidates}`}</span>
              </vscode-link>
            </span>
          </vscode-radio>
          <vscode-radio ${printOut ? "checked" : ""} class="w-32" value="Print" title="${l10n.t("Direct print completion code to editor, the cadidate number setting in `engine.config` will be ignored")}">
            ${l10n.t("Print")}
          </vscode-radio>
        </vscode-radio-group>
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
      </div>
      <div class="ml-4">
        <div class="flex flex-row my-2 px-2 gap-2">
          <span>${l10n.t("Clear all settings")}</span>
          <vscode-link style="margin: -1px 0;"><span id="clearAll" class="material-symbols-rounded">settings_power</span></vscode-link>
        </div>
      </div>
      <vscode-divider style="border-top: calc(var(--border-width) * 1px) solid var(--panel-view-border);padding-bottom: 4rem;"></vscode-divider>
    </div>
    `;
    this.sendMessage({ type: 'updateSettingPage', value: settingPage, toggle });
  }

  public resolveWebviewView(
    webviewView: WebviewView,
    _context: WebviewViewResolveContext,
    _token: CancellationToken,
  ) {
    this.webView = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      enableCommandUris: true,
      localResourceRoots: [
        this.context.extensionUri
      ]
    };

    webviewView.webview.html = this.getWebviewHtml(webviewView.webview);
    webviewView.webview.onDidReceiveMessage(async data => {
      switch (data.type) {
        case 'listPrompt': {
          this.sendMessage({ type: 'promptList', value: configuration.prompt });
          break;
        }
        case 'repareQuestion': {
          let selection: string = "";
          const editor = window.activeTextEditor;
          let lang = "";
          if (editor) {
            selection = editor.document.getText(editor.selection);
            lang = editor.document.languageId;
          }
          if (data.value) {
            this.sendApiRequest(data.value, selection, lang);
          }
          break;
        }
        case 'sendQuestion': {
          this.sendApiRequest(data.value, data.code, data.lang);
          break;
        }
        case 'stopGenerate': {
          let id = parseInt(data.id);
          this.stopList.push(id);
          this.sendMessage({ type: 'stopResponse', id, byUser: true });
          break;
        }
        case 'editCode': {
          let docUri = window.activeTextEditor?.document.uri;
          if (docUri) {
            window.activeTextEditor?.insertSnippet(new SnippetString(data.value)).then(async (_v) => {
              await new Promise((f) => setTimeout(f, 200));
              commands.executeCommand("editor.action.formatDocument", docUri);
            });
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
          let ae = configuration.engines.filter((e) => {
            return e.label === data.value;
          });
          let e = ae[0];
          if (configuration.activeEngine === undefined || !e || configuration.activeEngine.label !== e.label) {
            configuration.activeEngine = e;
            this.updateSettingPage(false);
          }
          break;
        }
        case 'setKey': {
          await window.showInputBox({ title: `${l10n.t("SenseCode: Input your Key...")}`, password: true, ignoreFocusOut: true }).then(async (v) => {
            configuration.setApiKey(configuration.activeEngine, v);
          });
          break;
        }
        case 'clearKey': {
          if (configuration.activeEngine) {
            let label = configuration.activeEngine.label;
            window.showWarningMessage(
              l10n.t("Clear API Key for {0} from Secret Storage?", label),
              { modal: true },
              l10n.t("Clear"))
              .then((v) => {
                if (v === l10n.t("Clear")) {
                  configuration.setApiKey(configuration.activeEngine, undefined);
                }
              });
          }
          break;
        }
        case 'triggerMode': {
          if (configuration.autoComplete !== (data.value === "Auto")) {
            configuration.autoComplete = (data.value === "Auto");
            this.updateSettingPage(false);
          }
          break;
        }
        case 'responseMode': {
          if (configuration.streamResponse !== (data.value === "Streaming")) {
            configuration.streamResponse = (data.value === "Streaming");
            this.updateSettingPage(false);
          }
          break;
        }
        case 'delay': {
          if (data.value !== configuration.delay) {
            configuration.delay = data.value;
            this.updateSettingPage(false);
          }
          break;
        }
        case 'completionMode': {
          if (configuration.printOut !== (data.value === "Print")) {
            configuration.printOut = (data.value === "Print");
            this.updateSettingPage(false);
          }
          break;
        }
        case 'candidates': {
          if (data.value <= 0) {
            data.value = 1;
          }
          configuration.candidates = data.value;
          this.updateSettingPage(false);
          break;
        }
        case 'clearAll': {
          window.showWarningMessage(
            l10n.t("Clear all settings?"),
            { modal: true },
            l10n.t("Clear"))
            .then(v => {
              if (v === l10n.t("Clear")) {
                configuration.clear();
              }
            });
          break;
        }
        case 'telemetry': {
          telemetryReporter.logUsage(data.info.event, data.info);
          break;
        }
        default:
          break;
      }
    });
  }

  public async sendApiRequest(prompt: Prompt, code?: string, lang?: string) {
    let response: string;
    let ts = new Date();
    let id = ts.valueOf();
    let timestamp = ts.toLocaleString();

    let send = true;
    let streaming = configuration.streamResponse;
    let instruction = prompt.prompt;
    if (instruction.includes("${input")) {
      send = false;
    }

    let promptClone = { ...prompt };
    promptClone.prompt = instruction;

    if (prompt.type !== "free chat" && (!code || code === "")) {
      this.sendMessage({ type: 'showError', category: 'no-code', value: l10n.t("No code selected"), id });
      return;
    }
    let rs: GetCodeCompletions | IncomingMessage;
    try {
      let activeEngine: Engine | undefined = configuration.activeEngine;
      if (!activeEngine) {
        throw Error(l10n.t("Active engine not set"));
      }
      let username = await configuration.username(activeEngine);
      let avatar = await configuration.avatar(activeEngine);
      this.sendMessage({ type: 'addQuestion', username, avatar, value: promptClone, code, lang, send, id, streaming, timestamp });
      if (!send) {
        return;
      }

      let prefix = "";
      let suffix = "";
      if (prompt.type === "custom" || prompt.type === "free chat" || prompt.type === "code Q&A") {
        prefix = instruction;
      } else {
        prefix = `Below is an instruction that describes a task. Write a response that appropriately completes the request.\n\n### Instruction:\nTask type: ${prompt.type}. ${instruction}\n\n### Input:\n`;
        suffix = `\n### Response:\n`;
      }

      let codeStr = "";
      if (code) {
        codeStr = `\`\`\`${lang ? lang.toLowerCase() : ""}\n${code}\n\`\`\``;
      }
      rs = await getCodeCompletions(activeEngine, `${prefix}\n${codeStr}\n${suffix}`, streaming);
      if (rs instanceof IncomingMessage) {
        let data = rs as IncomingMessage;
        data.on("data", async (v: any) => {
          if (this.stopList.includes(id)) {
            this.stopList = this.stopList.filter(item => item !== id);
            data.destroy();
            return;
          }
          let msgstr: string = v.toString();
          let msgs = msgstr.split("\n");
          for (let msg of msgs) {
            let content = "";
            if (msg.startsWith("data:")) {
              content = msg.slice(5).trim();
            } else if (msg.startsWith("event:")) {
              content = msg.slice(6).trim();
              outlog.error(content);
              if (content === "error") {
                // this.sendMessage({ type: 'addError', error: "streaming interrpted", id });
                // data.destroy();
              }
              // return;
              continue;
            }

            if (content === '[DONE]') {
              this.sendMessage({ type: 'stopResponse', id });
              outlog.debug(content);
              data.destroy();
              return;
            }
            if (content === "") {
              continue;
            }
            try {
              let json = JSON.parse(content);
              outlog.debug(JSON.stringify(json, undefined, 2));
              if (json.error) {
                this.sendMessage({ type: 'addError', error: json.error, id });
                data.destroy();
                return;
              } else if (json.choices && json.choices[0]) {
                let value = json.choices[0].text || json.choices[0].message?.content;
                if (value) {
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
      let errInfo = err.message || err.response.data.error;
      outlog.error(errInfo);
      this.sendMessage({ type: 'addError', error: errInfo, id });
    }
  }

  public async sendMessage(message: any) {
    // If the SenseCode view is not in focus/visible; focus on it to render Q&A
    if (!this.webView) {
      await commands.executeCommand('sensecode.view.focus');
      await new Promise((f) => setTimeout(f, 1000));
    } else {
      this.webView?.show?.(true);
    }
    if (this.webView) {
      this.webView?.webview.postMessage(message);
    }
  }

  private getWebviewHtml(webview: Webview) {
    const scriptUri = webview.asWebviewUri(Uri.joinPath(this.context.extensionUri, 'media', 'main.js'));
    const stylesMainUri = webview.asWebviewUri(Uri.joinPath(this.context.extensionUri, 'media', 'main.css'));

    const vendorHighlightCss = webview.asWebviewUri(Uri.joinPath(this.context.extensionUri, 'media', 'vendor', 'highlight.min.css'));
    const vendorHighlightJs = webview.asWebviewUri(Uri.joinPath(this.context.extensionUri, 'media', 'vendor', 'highlight.min.js'));
    const vendorMarkedJs = webview.asWebviewUri(Uri.joinPath(this.context.extensionUri, 'media', 'vendor', 'marked.min.js'));
    const vendorTailwindJs = webview.asWebviewUri(Uri.joinPath(this.context.extensionUri, 'media', 'vendor', 'tailwindcss.3.2.4.min.js'));
    const toolkitUri = webview.asWebviewUri(Uri.joinPath(this.context.extensionUri, "media", "vendor", "toolkit.js"));
    const iconUri = webview.asWebviewUri(Uri.joinPath(this.context.extensionUri, 'media', 'MeterialSymbols', 'meterialSymbols.css'));
    const logo = webview.asWebviewUri(Uri.joinPath(this.context.extensionUri, 'media', 'logo1.svg'));

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
                    <div id="cover" class="flex flex-col gap-2 overflow-auto">
                      <div id="Penrose" style="-webkit-mask-image: url(${logo});"></div>
                      <div id="Penrose-text" class="text-2xl font-bold text-center mb-6">${l10n.t("SenseCode")}</div>
                      <div id="shortcuts" class="flex flex-wrap self-center mx-8 overflow-auto"></div>
                    </div>
                    <div class="flex-1 overflow-y-auto" id="qa-list"></div>
                    <div id="error-wrapper"></div>
                    <div id="chat-button-wrapper" class="w-full flex gap-4 justify-center items-center mt-2 mb-2 hidden">
                        <div id="ask-list" class="hidden" style="background: var(--panel-view-background);z-index: 999999;"></div>
                        <button class="flex opacity-75 gap-2 justify-center items-center rounded-lg p-2" id="ask-button">
                            <span class="material-symbols-rounded">keyboard_double_arrow_up</span>
                            ${l10n.t("Ask")}
                        </button>          
                        <button class="flex opacity-75 gap-2 justify-center items-center rounded-lg p-2" id="chat-button">
                            <span class="material-symbols-rounded">chat_bubble</span>
                            ${l10n.t("Free chat")}
                        </button>
                        <button class="flex opacity-75 gap-2 justify-center items-center rounded-lg p-2" id="clear-button">
                            <span class="material-symbols-rounded">delete</span>
                            ${l10n.t("Clear")}
                        </button>
                    </div>
                </div>
                <script>
                  const l10nForUI = {
                    "Question": "${l10n.t("Question")}",
                    "SenseCode": "${l10n.t("SenseCode")}",
                    "Question Here...": "${l10n.t("Question Here...")}",
                    "Code Q&A": "${l10n.t("Code Q&A")}",
                    "Free chat": "${l10n.t("Free chat")}",
                    "Edit": "${l10n.t("Edit and resend this prompt")}",
                    "Cancel": "${l10n.t("Cancel [Esc]")}",
                    "Send": "${l10n.t("Send this prompt [Ctrl+Enter]")}",
                    "Copy": "${l10n.t("Copy to clipboard")}",
                    "Insert": "${l10n.t("Insert the below code to the current file")}",
                    "NewFile": "${l10n.t("Create a new file with the below code")}",
                    "Thinking...": "${l10n.t("Thinking...")}",
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
