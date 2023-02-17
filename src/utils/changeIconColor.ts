import * as vscode from "vscode";
import { updateStatusBarItem } from "./updateStatusBarItem";

export default function changeIconColor(
    myStatusBarItem: vscode.StatusBarItem,
    originalColor: string | vscode.ThemeColor | undefined,
    isLangDisabled?: boolean
): void {
    myStatusBarItem.show();
    updateStatusBarItem(myStatusBarItem, "", "");
    myStatusBarItem.backgroundColor = originalColor;
    if (isLangDisabled) {
        myStatusBarItem.backgroundColor = new vscode.ThemeColor(
            "statusBarItem.prominentBackground"
        );
        myStatusBarItem.color = new vscode.ThemeColor(
            "statusBarItem.prominentForeground"
        );
    }
}
