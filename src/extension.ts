process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
import * as vscode from "vscode";
import { checkPrivacy } from "./utils/checkPrivacy";
import { updateStatusBarItem } from "./utils/updateStatusBarItem";
import inlineCompletionProvider from "./provider/inlineCompletionProvider";
import changeIconColor from "./utils/changeIconColor";

let originalColor: string | vscode.ThemeColor | undefined;
let myStatusBarItem: vscode.StatusBarItem;

export async function activate(context: vscode.ExtensionContext) {
    checkPrivacy();
    // create a new status bar item that we can now manage
    myStatusBarItem = vscode.window.createStatusBarItem(
        vscode.StatusBarAlignment.Right,
        100
    );
    myStatusBarItem.backgroundColor = originalColor;
    updateStatusBarItem(myStatusBarItem, "", "");

    let inlineProvider: vscode.InlineCompletionItemProvider;

    inlineProvider = inlineCompletionProvider(
        myStatusBarItem,
        false
    );

    context.subscriptions.push(
        vscode.languages.registerInlineCompletionItemProvider(
            { pattern: "**" },
            inlineProvider
        )
    );

    context.subscriptions.push(
        vscode.window.onDidChangeActiveTextEditor(async (e) => {
            const editor = vscode.window.activeTextEditor;
            if (editor) {
                changeIconColor(
                    myStatusBarItem,
                    originalColor,
                    true
                );
            }
        })
    );
}
export function deactivate() { }
