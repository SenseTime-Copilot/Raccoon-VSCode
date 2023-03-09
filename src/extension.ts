import * as vscode from "vscode";
import { Configuration, Engine } from "./param/configures";
import { checkPrivacy } from "./utils/checkPrivacy";
import { updateStatusBarItem } from "./utils/updateStatusBarItem";
import { inlineCompletionProvider, showHideStatusBtn } from "./provider/inlineCompletionProvider";

let statusBarItem: vscode.StatusBarItem;

export async function activate(context: vscode.ExtensionContext) {
    new Configuration();
    let activeEngine: Engine | undefined = context.globalState.get("engine");
    let engines = Configuration.engines;
    if (activeEngine) {
        let e = engines.filter((e) => {
            return e.label === activeEngine!.label;
        });
        if (e.length === 0) {
            context.globalState.update("engine", undefined);
        }
    }
    vscode.workspace.onDidChangeConfiguration((e) => {
        if (e.affectsConfiguration("SenseCode")) {
            Configuration.update();
            updateStatusBarItem(context, statusBarItem, "");
        }
    });
    checkPrivacy();

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
                    qp.hide();
                }
            });
            qp.show();
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand("sensecode.inlineSuggest.trigger", () => {
            return vscode.commands.executeCommand("editor.action.inlineSuggest.trigger", vscode.window.activeTextEditor);
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand("sensecode.inlineSuggest.toggle", () => {
            const configuration = vscode.workspace.getConfiguration("SenseCode", undefined);
            let autoComplete = configuration.get("CompletionAutomatically", true);
            configuration.update("CompletionAutomatically", !autoComplete, true).then(() => {
                updateStatusBarItem(context, statusBarItem, "");
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
    updateStatusBarItem(context, statusBarItem, "");

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

}
export function deactivate() { }
