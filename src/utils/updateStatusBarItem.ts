import * as vscode from "vscode";

var statusbartimer: NodeJS.Timeout;

export async function updateStatusBarItem(
    statusBarItem: vscode.StatusBarItem,
    extraText: string
): Promise<void> {
    let tip = new vscode.MarkdownString;
    tip.isTrusted = true;
    tip.supportThemeIcons = true;
    let mode = '`Auto` [Switch to manual](command:sensecode.inlineSuggest.toggle "Switch to manual")';
    statusBarItem.show();
    if (statusbartimer) {
        clearTimeout(statusbartimer);
    }
    const configuration = vscode.workspace.getConfiguration("SenseCode", undefined);
    let autoComplete = configuration.get("CompletionAutomatically", true);
    if (!autoComplete) {
        mode = '`Alt+/` [Switch to automatic](command:sensecode.inlineSuggest.toggle "Switch to automatic")';
    }

    let engine = `\`Custom Engine\` [Change engine](command:sensecode.config.selectEngine "Change engine")`;
    let url = configuration.get("EngineAPI", "");
    if (url.includes("code.sensecore")) {
        engine = `\`SenseCode\` [Change engine](command:sensecode.config.selectEngine "Change engine")`;
    } else if (url.includes("tianqi")) {
        engine = `\`TianQi\` [Change engine](command:sensecode.config.selectEngine "Change engine")`;
    }

    tip.appendMarkdown(`**SenseCode**\n\n`);
    tip.appendMarkdown(`***\n\n`);
    tip.appendMarkdown(`$(info) Code Engine: ${engine}\n\n`);
    tip.appendMarkdown(`$(info) Trigger Mode: ${mode}\n\n`);
    tip.appendMarkdown(`$(gear) All Settings: [Open setting page](command:workbench.action.openGlobalSettings?${encodeURIComponent(JSON.stringify({ query: "SenseCode" }))} "Open setting page")\n\n`);

    statusBarItem.tooltip = tip;
    statusBarItem.text = "$(sensecore-dark)";
    if (extraText) {
        statusBarItem.text = `$(sensecore-dark) - ${extraText}`;
    }

    if (extraText != "$(sync~spin)") {
        statusbartimer = setTimeout(() => {
            statusBarItem.text = `$(sensecore-dark)`;
        }, 10000);
    }
}
