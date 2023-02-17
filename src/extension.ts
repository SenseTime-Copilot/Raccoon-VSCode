import * as vscode from "vscode";
import { checkPrivacy } from "./utils/checkPrivacy";
import { updateStatusBarItem } from "./utils/updateStatusBarItem";
import { inlineCompletionProvider, showHideStatusBtn } from "./provider/inlineCompletionProvider";

let statusBarItem: vscode.StatusBarItem;

export async function activate(context: vscode.ExtensionContext) {
    checkPrivacy();

    context.subscriptions.push(
        vscode.commands.registerCommand("sensecode.inlineSuggest.trigger", () => {
            return vscode.commands.executeCommand("editor.action.inlineSuggest.trigger", vscode.window.activeTextEditor);
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand("sensecode.inlineSuggest.toggle", () => {
            const configuration = vscode.workspace.getConfiguration("SenseCode", undefined);
            let autoComplete = configuration.get("CompletionAutomatically", true);
            configuration.update("CompletionAutomatically", !autoComplete).then(() => {
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
    statusBarItem.command = "sensecode.inlineSuggest.toggle";
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
