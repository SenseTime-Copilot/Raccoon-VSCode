import * as vscode from "vscode";

var statusbartimer: NodeJS.Timeout;

export async function updateStatusBarItem(
    statusBarItem: vscode.StatusBarItem,
    extraText: string
): Promise<void> {
    let tooltip = "Auto";
    statusBarItem.show();
    if (statusbartimer) {
        clearTimeout(statusbartimer);
    }
    const configuration = vscode.workspace.getConfiguration("SenseCode", undefined);
    let autoComplete = configuration.get("CompletionAutomatically", true);
    if (!autoComplete) {
        tooltip = 'Manual';
    }
    statusBarItem.tooltip = "SenseCode: " + tooltip;
    statusBarItem.text = `$(lightbulb)`;
    if (extraText) {
        statusBarItem.text = `$(lightbulb) ${extraText}`;
    }

    if (extraText != "$(sync~spin)") {
        statusbartimer = setTimeout(() => {
            statusBarItem.text = `$(lightbulb)`;
        }, 10000);
    }
}
