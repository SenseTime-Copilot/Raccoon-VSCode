import * as vscode from "vscode";
import { Configuration } from "./param/configures";
import { checkPrivacy } from "./utils/checkPrivacy";
import { updateStatusBarItem } from "./utils/updateStatusBarItem";
import { inlineCompletionProvider, showHideStatusBtn } from "./provider/inlineCompletionProvider";

let statusBarItem: vscode.StatusBarItem;

export async function activate(context: vscode.ExtensionContext) {
    new Configuration();
    vscode.workspace.onDidChangeConfiguration((e) => {
        if (e.affectsConfiguration("SenseCode")) {
            Configuration.update();
            updateStatusBarItem(statusBarItem, "");
        }
    });
    checkPrivacy();

    context.subscriptions.push(
        vscode.commands.registerCommand("sensecode.config.selectEngine", () => {
            const configuration = vscode.workspace.getConfiguration("SenseCode", undefined);
            let url = configuration.get("EngineAPI", "");
            let engine = `Custom Engine - ${url}`;
            if (url.includes("code.sensecore")) {
                engine = `SenseCode - ${url}`;
            } else if (url.includes("tianqi")) {
                engine = `TianQi - ${url}`;
            }
            let qp = vscode.window.createQuickPick();
            qp.placeholder = `Select engine, current is [${engine}]`;
            qp.items = [{
                label: "SenseCode",
                description: "https://code.sensecore.cn/api/v1",
            },
            {
                label: "TianQi",
                description: "https://tianqi.aminer.cn/api/v2",
            },
            {
                label: "",
                kind: vscode.QuickPickItemKind.Separator,
            },
            {
                label: "Custom Engine..."
            }];
            qp.onDidChangeSelection(items => {
                if (items[0]) {
                    if (items[0].label === "Custom Engine...") {
                        vscode.commands.executeCommand("workbench.action.openGlobalSettings", { query: "SenseCode.EngineAPI" });
                    } else {
                        configuration.update("EngineAPI", items[0].description, true);
                    }
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
                updateStatusBarItem(statusBarItem, "");
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
    updateStatusBarItem(statusBarItem, "");

    let inlineProvider: vscode.InlineCompletionItemProvider;

    inlineProvider = inlineCompletionProvider(
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
