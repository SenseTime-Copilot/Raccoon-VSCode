import * as vscode from "vscode";
import { Configuration, Engine } from "../param/configures";

var statusbartimer: NodeJS.Timeout;

export async function updateStatusBarItem(
    context: vscode.ExtensionContext,
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
    let autoComplete = Configuration.autoCompleteEnabled;
    if (!autoComplete) {
        mode = '`Alt+/` [Switch to automatic](command:sensecode.inlineSuggest.toggle "Switch to automatic")';
    }

    let activeEngine = context.globalState.get<Engine>("engine");

    let engine = `\`${activeEngine?.label || 'None'}\` [Change engine](command:sensecode.config.selectEngine "Change engine")`;

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
