import { IncomingMessage } from 'http';
import * as vscode from 'vscode';
import { Configuration } from '../param/configures';
import { GetCodeCompletions, getCodeCompletions } from "../utils/getCodeCompletions";

export class SenseCodeViewProvider implements vscode.WebviewViewProvider {
    private webView?: vscode.WebviewView;
    private promptList = Configuration.prompt;

    constructor(private context: vscode.ExtensionContext) {
        vscode.workspace.onDidChangeConfiguration((e) => {
            if (e.affectsConfiguration("SenseCode")) {
                Configuration.update();
                this.promptList = Configuration.prompt;
                this.sendMessage({ type: "promptList", value: this.promptList });
            }
        });
    }

    public resolveWebviewView(
        webviewView: vscode.WebviewView,
        _context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken,
    ) {
        this.webView = webviewView;

        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [
                this.context.extensionUri
            ]
        };

        webviewView.webview.html = this.getWebviewHtml(webviewView.webview);

        webviewView.webview.onDidReceiveMessage(async data => {
            switch (data.type) {
                case 'listPrompt':
                    this.sendMessage({ type: 'promptList', value: this.promptList });
                    break;
                case 'repareQuestion':
                    let selection = undefined;
                    const editor = vscode.window.activeTextEditor;
                    if (!editor) {
                        return;
                    }
                    selection = editor.document.getText(editor.selection);
                    this.sendApiRequest(data.value, selection, false);
                    break;
                case 'addFreeTextQuestion':
                    this.sendApiRequest(data.value, data.code, data.send);
                    break;
                case 'editCode':
                    vscode.window.activeTextEditor?.insertSnippet(new vscode.SnippetString(data.value));
                    break;
                case 'openNew':
                    const document = await vscode.workspace.openTextDocument({
                        content: data.value,
                        language: data.language
                    });
                    vscode.window.showTextDocument(document);
                    break;
                default:
                    break;
            }
        });
    }

    public async sendApiRequest(prompt: string, code: string, send = true) {
        let response: string;
        let question = prompt;

        if (code != null) {
            // Add prompt prefix to the code if there was a code block selected
            question = `${prompt} \`\`\`\n${code}\n\`\`\``;
        }

        let id = new Date().valueOf();

        this.sendMessage({ type: 'addQuestion', value: prompt, code, send, id });
        if (!send) {
            return;
        }

        let rs: GetCodeCompletions | IncomingMessage;
        try {
            rs = await getCodeCompletions(this.context,
                question,
                "__Q&A__");
            if (rs instanceof IncomingMessage) {
                let data = rs as IncomingMessage;
                data.on("data", async (v: any) => {
                    let msgstr: string = v.toString();
                    let msgs = msgstr.split("data:").filter((v) => {
                        return v !== "data: ";
                    });
                    for (let msg of msgs) {
                        let content = msg.trim();
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
                            this.sendMessage({ type: 'stopResponse', id });
                            data.destroy();
                            return;
                        } else {
                            this.sendMessage({ type: 'addResponse', id, value: json.choices[0].text || json.choices[0].message.content });
                        }
                    }
                });
            } else {
                response = rs.completions[0];
                this.sendMessage({ type: 'addResponse', value: response });
                this.sendMessage({ type: 'stopResponse' });
            }
        } catch (error: any) {
            this.sendMessage({ type: 'addError', error, id });
            return;
        }
    }

    public async sendMessage(message: any) {
        // If the SenseCode view is not in focus/visible; focus on it to render Q&A
        if (this.webView == null) {
            await vscode.commands.executeCommand('sensecode.view.focus');
            await new Promise((f) => setTimeout(f, 1000));
        } else {
            this.webView?.show?.(true);
        }
        if (this.webView) {
            this.webView?.webview.postMessage(message);
        }
    }

    private getWebviewHtml(webview: vscode.Webview) {
        const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, 'media', 'main.js'));
        const stylesMainUri = webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, 'media', 'main.css'));

        const vendorHighlightCss = webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, 'media', 'vendor', 'highlight.min.css'));
        const vendorHighlightJs = webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, 'media', 'vendor', 'highlight.min.js'));
        const vendorMarkedJs = webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, 'media', 'vendor', 'marked.min.js'));
        const vendorTailwindJs = webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, 'media', 'vendor', 'tailwindcss.3.2.4.min.js'));
        const toolkitUri = webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, "media", "vendor", "toolkit.js"));
        const iconUri = webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, 'media', 'MeterialSymbols', 'meterialSymbols.css'));
        const logo = webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, 'media', 'logo1.svg'));

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
                <div class="flex flex-col h-screen" id="qa-list-wrapper">
                    <div id="cover" class="flex flex-col gap-2 m-8">
                        <div style="height: 120px; margin: 5em auto 8em auto; filter: opacity(0.3) contrast(0);">
                        <img src="${logo}"/>
                        <div class="text-xl text-center m-4">SenseCode</div>
                        </div>
                        <div id="shortcuts" class="flex flex-col gap-2">
                        </div>
                    </div>
                    <div class="flex-1 overflow-y-auto" id="qa-list"></div>

                    <div id="chat-button-wrapper" class="w-full flex gap-4 justify-center items-center mt-2 mb-2 hidden">
                        <button class="flex opacity-75 gap-2 justify-center items-center rounded-lg p-2" id="clear-button">
                            <span class="material-symbols-rounded" style="font-size: 2em;">delete_sweep</span>
                            Clear
                        </button>
                    </div>
                </div>

                <script src="${scriptUri}"></script>
            </body>
            </html>`;
    }
}
