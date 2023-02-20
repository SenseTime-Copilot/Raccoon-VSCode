import * as vscode from "vscode";

var statusbartimer: NodeJS.Timeout;

export async function updateStatusBarItem(
    statusBarItem: vscode.StatusBarItem,
    extraText: string
): Promise<void> {
    let text = "$(lightbulb-autofix)"
    let tooltip = "Auto";
    statusBarItem.show();
    if (statusbartimer) {
        clearTimeout(statusbartimer);
    }
    const configuration = vscode.workspace.getConfiguration("SenseCode", undefined);
    let autoComplete = configuration.get("CompletionAutomatically", true);
    if (!autoComplete) {
        text = "$(lightbulb)"
        tooltip = 'Manual';
    }
    statusBarItem.tooltip = "SenseCode: " + tooltip;
    statusBarItem.text = text;
    if (extraText) {
        statusBarItem.text = `${text} ${extraText}`;
    }

    if (extraText != "$(sync~spin)") {
        statusbartimer = setTimeout(() => {
            statusBarItem.text = `${text}`;
        }, 10000);
    }
}
