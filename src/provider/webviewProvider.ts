import * as vscode from 'vscode';
import { GetCodeCompletions, getCodeCompletions } from "../utils/getCodeCompletions";

export class SenseCodeViewProvider implements vscode.WebviewViewProvider {
    private webView?: vscode.WebviewView;

    constructor(private context: vscode.ExtensionContext) {
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
                case 'addFreeTextQuestion':
                    this.sendApiRequest(data.value);
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

    public async sendApiRequest(prompt: string, code?: string) {
        let response: string;
        let question = prompt;

        if (code != null) {
            // Add prompt prefix to the code if there was a code block selected
            question = `${prompt} ${code}`;
        }

        // If the SenseCode view is not in focus/visible; focus on it to render Q&A
        if (this.webView == null) {
            await vscode.commands.executeCommand('sensecode.view.focus');
        } else {
            this.webView?.show?.(true);
        }

        this.sendMessage({ type: 'addQuestion', value: prompt, code });

        let rs: GetCodeCompletions;
        try {
            rs = await getCodeCompletions(this.context,
                question,
                "__Q&A__");
            response = rs.completions[0];
        } catch (error: any) {
            vscode.window.showErrorMessage("An error occured.");
            this.sendMessage({ type: 'addError' });
            return;
        }

        this.sendMessage({ type: 'addResponse', value: response });
    }

    public sendMessage(message: any) {
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

					<div class="flex-1 overflow-y-auto" id="qa-list"></div>

					<div id="in-progress" class="pl-4 pt-2 flex items-center hidden">
						<div class="typing">Typing</div>
						<div class="spinner">
							<div class="bounce1"></div>
							<div class="bounce2"></div>
							<div class="bounce3"></div>
						</div>
					</div>

					<div id="chat-button-wrapper" class="w-full flex gap-4 justify-center items-center mt-2 hidden">
						<button class="flex gap-2 justify-center items-center rounded-lg p-2" id="clear-button">
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
