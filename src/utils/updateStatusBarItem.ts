import * as vscode from "vscode";
var statusbartimer: NodeJS.Timeout;

export async function updateStatusBarItem(
    myStatusBarItem: vscode.StatusBarItem,
    extraText: string,
    toolip: string
): Promise<void> {
    myStatusBarItem.show();
    if (statusbartimer) {
        clearTimeout(statusbartimer);
    }
    myStatusBarItem.tooltip = "SenseCode: " + toolip;
    myStatusBarItem.text = `$(lightbulb)`;
    if (extraText) {
        myStatusBarItem.text = `$(lightbulb) ${extraText}`;
    }

    if (extraText != "$(sync~spin)") {
        statusbartimer = setTimeout(() => {
            myStatusBarItem.text = `$(lightbulb)`;
        }, 10000);
    }
}
