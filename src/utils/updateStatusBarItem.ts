import * as vscode from "vscode";
import { Configuration, Engine } from "../param/configures";

var statusbartimer: NodeJS.Timeout;

export async function updateStatusBarItem(
  context: vscode.ExtensionContext,
  statusBarItem: vscode.StatusBarItem,
  extraIcon?: string,
  errText?: string
): Promise<void> {
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

  let engine = `\`'None'\` [Goto settings](command:sensecode.settings "Set engine config")`;
  if (activeEngine) {
    if (Configuration.engines.length > 1) {
      engine = `\`${activeEngine.label}\` [Change engine](command:sensecode.config.selectEngine "Change engine")`;
    } else {
      engine = `\`${activeEngine.label}\` [Goto settings](command:sensecode.settings "Set engine config")`;
    }
  }

  statusBarItem.text = "$(sensecore-dark)";
  if (extraIcon) {
    statusBarItem.text = `$(sensecore-dark) - $(${extraIcon})`;
    statusBarItem.tooltip = buildTip(engine, tmode, cmode, errText);
  } else {
    statusBarItem.tooltip = buildTip(engine, tmode, cmode);
  }

  if (extraIcon !== "sync~spin") {
    statusbartimer = setTimeout(() => {
      statusBarItem.tooltip = buildTip(engine, tmode, cmode);
      statusBarItem.text = `$(sensecore-dark)`;
    }, 10000);
  }
}

function buildTip(engine: string, tmode: string, cmode: string, err?: string) {
  let tip = new vscode.MarkdownString;
  tip.isTrusted = true;
  tip.supportThemeIcons = true;
  tip.appendMarkdown(`**SenseCode**\n\n`);
  tip.appendMarkdown(`***\n\n`);
  tip.appendMarkdown(`$(hubot) Code Engine: ${engine}\n\n`);
  tip.appendMarkdown(`$(zap) Trigger Mode: ${tmode}\n\n`);
  tip.appendMarkdown(`$(wand) Complition Mode: ${cmode}\n\n`);
  tip.appendMarkdown(`$(gear) All Settings: [Open setting page](command:sensecode.settings "Open setting page")\n\n`);
  if (err) {
    tip.appendMarkdown(`***\n\n`);
    tip.appendMarkdown(`$(bell) ${err}`);
  }
  return tip;
}

