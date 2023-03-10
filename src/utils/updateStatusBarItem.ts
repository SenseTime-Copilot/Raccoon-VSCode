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
    let tmode = '`Alt+/` [Switch to automatic](command:sensecode.inlineSuggest.toggleAuto "Switch to automatic")';
    let cmode = '`Snippets` [Switch to print](command:sensecode.inlineSuggest.togglePrintOut "Switch to print")';
    statusBarItem.show();
    if (statusbartimer) {
        clearTimeout(statusbartimer);
    }
    let autoComplete = Configuration.autoCompleteEnabled;
    if (autoComplete) {
        tmode = '`Auto` [Switch to manual](command:sensecode.inlineSuggest.toggleAuto "Switch to manual")';
    }

    let printOut = Configuration.printOut;
    if (printOut) {
        cmode = '`Print` [Switch to snippets](command:sensecode.inlineSuggest.togglePrintOut "Switch to snippets")';
    }

    let activeEngine = context.globalState.get<Engine>("engine");

    let engine = `\`${activeEngine?.label || 'None'}\` [Change engine](command:sensecode.config.selectEngine "Change engine")`;

    tip.appendMarkdown(`**SenseCode**\n\n`);
    tip.appendMarkdown(`***\n\n`);
    tip.appendMarkdown(`$(hubot) Code Engine: ${engine}\n\n`);
    tip.appendMarkdown(`$(zap) Trigger Mode: ${tmode}\n\n`);
    tip.appendMarkdown(`$(wand) Complition Mode: ${cmode}\n\n`);
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
