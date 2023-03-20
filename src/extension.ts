import * as vscode from "vscode";
import { Configuration, Engine } from "./param/configures";
import { checkPrivacy } from "./utils/checkPrivacy";
import { updateStatusBarItem } from "./utils/updateStatusBarItem";
import { inlineCompletionProvider, showHideStatusBtn } from "./provider/inlineCompletionProvider";
import { SenseCodeViewProvider } from "./provider/webviewProvider";

let statusBarItem: vscode.StatusBarItem;

export async function activate(context: vscode.ExtensionContext) {
    new Configuration();

    let activeEngine: Engine | undefined = context.globalState.get("engine");
    let engines = Configuration.engines;
    if (activeEngine) {
        let e = engines.filter((e) => {
            return e.label === activeEngine!.label;
        });
        if (e.length !== 0) {
            activeEngine = e[0];
            context.globalState.update("engine", e[0]);
        }
    }
    if (!activeEngine) {
        activeEngine = engines[0];
        context.globalState.update("engine", engines[0]);
    }
    vscode.workspace.onDidChangeConfiguration((e) => {
        if (e.affectsConfiguration("SenseCode")) {
            Configuration.update();
            let activeEngine: Engine | undefined = context.globalState.get("engine");
            if (activeEngine) {
                let newEngine = Configuration.engines.filter((v) => { return v.label === activeEngine?.label });
                context.globalState.update("engine", newEngine[0]);
            }
            updateStatusBarItem(context, statusBarItem);
        }
    });
    checkPrivacy(context);

    context.subscriptions.push(
        vscode.commands.registerCommand("sensecode.config.selectEngine", () => {
            let engine = Configuration.engines;
            let activeEngine = context.globalState.get("engine");
            let qp = vscode.window.createQuickPick<Engine>();
            qp.placeholder = `Select engine, current is [${activeEngine}]`;
            qp.items = engine;
            qp.onDidChangeSelection(items => {
                if (items[0]) {
                    context.globalState.update("engine", items[0]);
                    updateStatusBarItem(context, statusBarItem);
                    qp.hide();
                }
            });
            qp.show();
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand("sensecode.settings", () => {
            return vscode.commands.executeCommand("workbench.action.openGlobalSettings", { query: "SenseCode" });
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand("sensecode.inlineSuggest.trigger", async () => {
            let privacy = await checkPrivacy(context);
            if (!privacy) {
                return;
            }
            return vscode.commands.executeCommand("editor.action.inlineSuggest.trigger", vscode.window.activeTextEditor);
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand("sensecode.inlineSuggest.toggleAuto", () => {
            const configuration = vscode.workspace.getConfiguration("SenseCode", undefined);
            let autoComplete = configuration.get("CompletionAutomatically", true);
            configuration.update("CompletionAutomatically", !autoComplete, true).then(() => {
                Configuration.update();
                updateStatusBarItem(context, statusBarItem);
            }, (reason) => {
                vscode.window.showErrorMessage(reason);
            });
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand("sensecode.inlineSuggest.togglePrintOut", () => {
            const configuration = vscode.workspace.getConfiguration("SenseCode", undefined);
            let printOut = configuration.get("DirectPrintOut", true);
            configuration.update("DirectPrintOut", !printOut, true).then(() => {
                Configuration.update();
                updateStatusBarItem(context, statusBarItem);
            }, (reason) => {
                vscode.window.showErrorMessage(reason);
            });
        })
    );

    // create a new status bar item that we can now manage
    statusBarItem = vscode.window.createStatusBarItem(
        vscode.StatusBarAlignment.Right,
        100
    );
    statusBarItem.color = new vscode.ThemeColor("statusBar.remoteForeground");
    statusBarItem.backgroundColor = new vscode.ThemeColor("statusBar.remoteBackground");
    updateStatusBarItem(context, statusBarItem);

    let inlineProvider: vscode.InlineCompletionItemProvider;

    inlineProvider = inlineCompletionProvider(
        context,
        statusBarItem
    );

    showHideStatusBtn(vscode.window.activeTextEditor?.document, statusBarItem);

    context.subscriptions.push(
        vscode.languages.registerInlineCompletionItemProvider(
            { pattern: "**" },
            inlineProvider
        )
    );

    context.subscriptions.push(
        vscode.window.onDidChangeActiveTextEditor((editor) => {
            showHideStatusBtn(editor?.document, statusBarItem);
        })
    );

    const provider = new SenseCodeViewProvider(context);

    const view = vscode.window.registerWebviewViewProvider(
        "sensecode.view",
        provider,
        {
            webviewOptions: {
                retainContextWhenHidden: true,
            },
        }
    );
    context.subscriptions.push(view);

    const commands = [
        ["sensecode.addTests", "addTests"],
        ["sensecode.findProblems", "findProblems"],
        ["sensecode.optimize", "optimize"],
        ["sensecode.explain", "explain"]
    ];

    const registeredCommands = commands.map(([command, promptKey]) =>
        vscode.commands.registerCommand(command, async () => {
            let privacy = await checkPrivacy(context);
            if (!privacy) {
                return;
            }
            let selection = undefined;
            let commandPrefix = Configuration.prompt[promptKey] as string;
            const editor = vscode.window.activeTextEditor;
            if (!editor) {
                return;
            }

            selection = editor.document.getText(editor.selection);
            provider?.sendApiRequest(commandPrefix, selection);
        })
    );

    const customPromptCommand = vscode.commands.registerCommand("sensecode.customPrompt", async () => {
        let privacy = await checkPrivacy(context);
        if (!privacy) {
            return;
        }
        let selection = undefined;
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            return;
        }
        selection = editor.document.getText(editor.selection);
        provider?.sendApiRequest("", selection, false);
    });

    context.subscriptions.push(customPromptCommand, ...registeredCommands);

}
export function deactivate() { }
