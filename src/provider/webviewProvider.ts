import { IncomingMessage } from 'http';
import { window, workspace, WebviewViewProvider, WebviewView, ExtensionContext, WebviewViewResolveContext, CancellationToken, SnippetString, commands, Webview, Uri, l10n } from 'vscode';
import { configuration } from '../extension';
import { Engine } from '../param/configures';
import { GetCodeCompletions, getCodeCompletions } from "../utils/getCodeCompletions";
import { getDocumentLanguage } from './inlineCompletionProvider';

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
          if (e.affectsConfiguration("SenseCode.Next")) {
            commands.executeCommand("setContext", "sensecode.next.chat", configuration.next.chat === true);
            this.sendMessage({ type: 'updateNextFlags', value: configuration.next });
          }
          this.updateSettingPage(false);
        }
      })
    );
  }

  async updateSettingPage(show: boolean
  ): Promise<void> {
    let activeEngine = configuration.activeEngine;
    let es = configuration.engines;
    let esList = `<vscode-dropdown id="engineDropdown" class="w-full" ${activeEngine ? `value="${activeEngine.label}"` : ""}>`;
    for (let e of es) {
      esList += `<vscode-option class="align-middle" value="${e.label}">${e.label}</vscode-option>`;
    }
    esList += "</vscode-dropdown>";
    let autoComplete = configuration.autoCompleteEnabled;
    let printOut = configuration.printOut;
    let delay = configuration.delay;
    let settingUri = Uri.parse(`command:workbench.action.openGlobalSettings?${encodeURIComponent(JSON.stringify({ query: "SenseCode" }))}`);
    let setEngineUri = Uri.parse(`command:workbench.action.openGlobalSettings?${encodeURIComponent(JSON.stringify({ query: "SenseCode.Engines" }))}`);
    let settingPage = `
    <div id="settings" class="h-screen flex flex-col gap-2 mx-auto p-4 max-w-sm">
      <h3 class="flex flex-row justify-between text-base font-bold">
        ${l10n.t("Settings")}
        <div>
          <span id="close-settings" class="cursor-pointer material-symbols-rounded" onclick="document.getElementById('settings').remove();">close</span>
        </div>
      </h3>
      <vscode-divider style="border-top: calc(var(--border-width) * 1px) solid var(--divider-background);"></vscode-divider>
      <div class="flex flex-col gap-2 w-full">
        <b>${l10n.t("Code Engine")}</b>
        <div class=" flex flex-row justify-between px-2 gap-2">
          ${esList}
          <vscode-link slot="indicator" href="${setEngineUri}" title="${l10n.t("Settings")}">
            <span class="material-symbols-rounded">tune</span>
          </vscode-link>
        </div>
      </div>
      <vscode-divider style="border-top: calc(var(--border-width) * 1px) solid var(--divider-background);"></vscode-divider>
      <div class="flex flex-col gap-2 w-full">
        <b>${l10n.t("Trigger Mode")}</b>
        <div>
        <vscode-radio-group id="triggerModeRadio" class="flex flex-wrap px-2">
          <vscode-radio ${autoComplete ? "checked" : ""} class="w-32" value="Auto" title="${l10n.t("Get completion suggestions once stop typing")}">
            ${l10n.t("Auto")}
            <span id="triggerDelay" class="${autoComplete ? "" : "hidden"}">
              <vscode-link id="triggerDelayShortBtn" class="align-middle ${delay === 1 ? "" : "hidden"}" title="${l10n.t("Short delay")}">
                <span id="triggerDelayShort" class="material-symbols-rounded">timer</span>
              </vscode-link>
              <vscode-link id="triggerDelayLongBtn" class="align-middle ${delay !== 1 ? "" : "hidden"}" title="${l10n.t("Delay 3 senconds")}">
                <span id="triggerDelayLong" class="material-symbols-rounded">timer_3_alt_1</span>
              </vscode-link>
            </span>
          </vscode-radio>
          <vscode-radio ${autoComplete ? "" : "checked"} class="w-32" value="Manual" title="${l10n.t("Get completion suggestions on keyboard event")}">
            ${l10n.t("Manual")}
            <vscode-link href="${Uri.parse("command:sensecode.inlineSuggest.setKeybinding")}" id="keyBindingBtn" class="${autoComplete ? "hidden" : ""} align-middle" title="${l10n.t("Set keyboard shortcut")}">
              <span class="material-symbols-rounded">keyboard</span>
            </vscode-link>
          </vscode-radio>
        </vscode-radio-group>
        </div>
      </div>
      <vscode-divider style="border-top: calc(var(--border-width) * 1px) solid var(--divider-background);"></vscode-divider>
      <div class="flex flex-col gap-2 w-full">
        <b>${l10n.t("Completion Mode")}</b>
        <div>
        <vscode-radio-group id="completionModeRadio" class="flex flex-wrap px-2">
          <vscode-radio ${printOut ? "" : "checked"} class="w-32" value="Snippets" title="${l10n.t("Show completion suggestions as inline completion snippets")}">
            ${l10n.t("Snippets")}
          </vscode-radio>
          <vscode-radio ${printOut ? "checked" : ""} class="w-32" value="Print" title="${l10n.t("Direct print completion code to editor, the cadidate number setting in `engine.config` will be ignored")}">
            ${l10n.t("Print")}
          </vscode-radio>
        </vscode-radio-group>
        </div>
      </div>
      <vscode-divider style="border-top: calc(var(--border-width) * 1px) solid var(--divider-background);"></vscode-divider>
      <div class="flex flex-col gap-2 w-full">
        <b>${l10n.t("Advanced")}</b>
        <div class="flex flex-row justify-between px-2">
          <span class="align-middle">${l10n.t("All settings")}</span>
          <vscode-link href="${settingUri}" title="${l10n.t("All settings")}"><span class="material-symbols-rounded">settings</span></vscode-link>
        </div>
      </div>
      <vscode-divider style="border-top: calc(var(--border-width) * 1px) solid var(--divider-background);"></vscode-divider>
    </div>
    `;
    this.sendMessage({ type: 'updateSettingPage', value: settingPage, show });
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
            lang = getDocumentLanguage(editor.document);
          }
          let prompt = "";
          let send = data.send || false;
          if (data.value) {
            if (data.value.includes("${input}")) {
              send = false;
            }
            prompt = data.value.replace("${input}", "").trim();
          }
          if (prompt !== "" && (selection?.trim() === "")) {
            window.showInformationMessage(l10n.t("No code selected"));
          } else {
            this.sendApiRequest(prompt, selection, lang, send);
          }
          break;
        }
        case 'sendQuestion': {
          this.sendApiRequest(data.value, data.code, data.lang, true);
          break;
        }
        case 'stopGenerate': {
          this.stopList.push(parseInt(data.id));
          break;
        }
        case 'editCode': {
          window.activeTextEditor?.insertSnippet(new SnippetString(data.value));
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
        case 'triggerMode': {
          if (configuration.autoCompleteEnabled !== (data.value === "Auto")) {
            configuration.autoCompleteEnabled = (data.value === "Auto");
          }
          break;
        }
        case 'delay': {
          if (data.value !== configuration.delay) {
            configuration.delay = data.value;
          }
        }
        case 'completionMode': {
          if (configuration.printOut !== (data.value === "Print")) {
            configuration.printOut = (data.value === "Print");
          }
          break;
        }
        default:
          break;
      }
    });
  }

  public async sendApiRequest(prompt: string, code: string, lang: string, send = true) {
    let response: string;
    let id = new Date().valueOf();

    this.sendMessage({ type: 'addQuestion', value: prompt, code, lang, send, id });
    if (!send) {
      return;
    }

    let rs: GetCodeCompletions | IncomingMessage;
    try {
      let activeEngine: Engine | undefined = configuration.activeEngine;
      if (!activeEngine) {
        throw Error(l10n.t("Active engine not set"));
      }
      let capacities: string[] = ["completion"];
      if (activeEngine.capacities) {
        capacities = activeEngine.capacities;
      }
      if (!capacities.includes("chat")) {
        throw Error(l10n.t("Current API not support Q&A"));
      }
      let prefix = "";
      if (code) {
        if (lang !== "") {
          prefix = l10n.t("The following code is {0} code.", lang);
        }
        prefix += l10n.t("If the response contains code, surraound them into markdown code block format.");
      }
      rs = await getCodeCompletions(activeEngine,
        prefix + prompt,
        `\`\`\`${lang.toLowerCase()}\n${code}\n\`\`\`\n`,
        true);
      if (rs instanceof IncomingMessage) {
        let data = rs as IncomingMessage;
        data.on("data", async (v: any) => {
          if (this.stopList.includes(id)) {
            this.stopList = this.stopList.filter(item => item !== id);
            this.sendMessage({ type: 'stopResponse', id });
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
              if (content === "error") {
                this.sendMessage({ type: 'addError', error: "", id });
                data.destroy();
              }
              return;
            }
            if (content === '[DONE]') {
              this.sendMessage({ type: 'stopResponse', id });
              data.destroy();
              return;
            }
            if (content === "") {
              continue;
            }
            let json = JSON.parse(content);
            if (json.error) {
              this.sendMessage({ type: 'addError', error: json.error, id });
              data.destroy();
              return;
            } else if (json.choices && json.choices[0]) {
              this.sendMessage({ type: 'addResponse', id, value: json.choices[0].text || json.choices[0].message?.content });
            }
          }
        });
      } else {
        response = rs.completions[0];
        this.sendMessage({ type: 'addResponse', id, value: response });
        this.sendMessage({ type: 'stopResponse', id });
      }
    } catch (error: any) {
      this.sendMessage({ type: 'addError', error: error.message, id });
    }
  }

  public async sendMessage(message: any) {
    // If the SenseCode view is not in focus/visible; focus on it to render Q&A
    if (this.webView === null) {
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

    let next = configuration.next;
    let bodyClass = "";
    for (let k in next) {
      if (next[k]) {
        bodyClass += `x-${k} `;
      }
    }
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
                <div class="flex flex-col h-screen ${bodyClass}" id="qa-list-wrapper">
                    <div id="cover" class="flex flex-col gap-2 m-8">
                        <div style="height: 120px; margin: 5em auto 8em auto; filter: opacity(0.3) contrast(0);">
                        <img src="${logo}"/>
                        <div class="text-xl text-center m-4">SenseCode</div>
                        </div>
                        <div id="shortcuts" class="flex flex-col gap-4 self-center w-60">
                        </div>
                    </div>
                    <div class="flex-1 overflow-y-auto" id="qa-list"></div>
                    <div id="chat-button-wrapper" class="w-full flex gap-4 justify-center items-center mt-2 mb-2 hidden">
                        <button class="flex opacity-75 gap-2 justify-center items-center rounded-lg p-2" id="ask-button">
                            <span class="material-symbols-rounded">live_help</span>
                            ${l10n.t("Ask")}
                        </button>          
                        <button class="flex opacity-75 gap-2 justify-center items-center rounded-lg p-2" id="chat-button">
                            <span class="material-symbols-rounded">quick_phrases</span>
                            ${l10n.t("Free Chat")}
                        </button>
                        <button class="flex opacity-75 gap-2 justify-center items-center rounded-lg p-2" id="clear-button">
                            <span class="material-symbols-rounded">delete</span>
                            ${l10n.t("Clear")}
                        </button>
                    </div>
                </div>
                <script>
                  const l10nForUI = {
                    "addTests": "${l10n.t("Add Tests")}",
                    "findProblems": "${l10n.t("Find Problems")}",
                    "optimize": "${l10n.t("Optimize")}",
                    "explain": "${l10n.t("Explain")}",
                    "FreeChat": "${l10n.t("Free Chat")}",
                    "Edit": "${l10n.t("Edit and resend this prompt")}",
                    "Cancel": "${l10n.t("Cancel [Esc]")}",
                    "Send": "${l10n.t("Send this prompt [Ctrl+Enter]")}",
                    "Copy": "${l10n.t("Copy to clipboard")}",
                    "Insert": "${l10n.t("Insert the below code to the current file")}",
                    "NewFile": "${l10n.t("Create a new file with the below code")}"
                  };
                </script>
                <script src="${scriptUri}"></script>
            </body>
            </html>`;
  }
}
