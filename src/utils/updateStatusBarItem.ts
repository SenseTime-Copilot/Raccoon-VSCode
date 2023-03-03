import * as vscode from "vscode";

var statusbartimer: NodeJS.Timeout;

export async function updateStatusBarItem(
    statusBarItem: vscode.StatusBarItem,
    extraText: string
): Promise<void> {
    let text = "$(lightbulb-autofix)"
    let tip = new vscode.MarkdownString;
    tip.isTrusted = true;
    let mode = "[Auto](command:sensecode.inlineSuggest.toggle)";
    statusBarItem.show();
    if (statusbartimer) {
        clearTimeout(statusbartimer);
    }
    const configuration = vscode.workspace.getConfiguration("SenseCode", undefined);
    let autoComplete = configuration.get("CompletionAutomatically", true);
    if (!autoComplete) {
        text = "$(lightbulb)"
        mode = '[Alt+/](command:sensecode.inlineSuggest.toggle)';
    }

    let engine = "SenseCore";
    let url = configuration.get("EngineAPI", "");
    if (url.includes("code.sensecore")) {
        engine = "SenseCode";
    } else if (url.includes("tianqi")) {
        engine = "TianQi";
    }

    tip.appendMarkdown(`**SenseCode**\n\n`);
    tip.appendMarkdown(`***\n\n`);
    tip.appendMarkdown(`Engine: ${engine}\n\n`);
    tip.appendMarkdown(`Trigger: ${mode}\n\n`);

    statusBarItem.tooltip = tip;
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
