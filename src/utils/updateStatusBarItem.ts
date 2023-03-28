import { ExtensionContext, StatusBarItem, MarkdownString, l10n } from "vscode";
import { Configuration, Engine } from "../param/configures";

var statusbartimer: NodeJS.Timeout;

export async function updateStatusBarItem(
  context: ExtensionContext,
  statusBarItem: StatusBarItem,
  extraIcon?: string,
  errText?: string
): Promise<void> {
  let tmode = `\`${l10n.t("Hotkey")}\`[$(keyboard)](command:sensecode.inlineSuggest.setKeybinding "${l10n.t("Set shortcut")}") | [${l10n.t("Switch to automatic")}](command:sensecode.inlineSuggest.toggleAuto "${l10n.t("Switch to automatic")}")`;
  let cmode = `\`${l10n.t("Snippets")}\` | [${l10n.t("Switch to print")}](command:sensecode.inlineSuggest.togglePrintOut "${l10n.t("Switch to print")}")`;
  statusBarItem.show();
  if (statusbartimer) {
    clearTimeout(statusbartimer);
  }
  let autoComplete = Configuration.autoCompleteEnabled;
  if (autoComplete) {
    tmode = `\`${l10n.t("Auto")}\` [$(watch)](command:sensecode.settings "${l10n.t("Set delay time")}") | [${l10n.t("Switch to manual")}](command:sensecode.inlineSuggest.toggleAuto "${l10n.t("Switch to manual")}")`;
  }

  let printOut = Configuration.printOut;
  if (printOut) {
    cmode = `\`${l10n.t("Print")}\` | [${l10n.t("Switch to snippets")}](command:sensecode.inlineSuggest.togglePrintOut "${l10n.t("Switch to snippets")}")`;
  }

  let activeEngine = context.globalState.get<Engine>("engine");

  let engine = `\`${l10n.t("None")}\` [${l10n.t("Goto settings")}](command:sensecode.settings "[${l10n.t("Goto settings")}")`;
  if (activeEngine) {
    if (Configuration.engines.length > 1) {
      engine = `\`${activeEngine.label}\` [${l10n.t("Change engine")}](command:sensecode.config.selectEngine "${l10n.t("Change engine")}")`;
    } else {
      engine = `\`${activeEngine.label}\` [${l10n.t("Goto settings")}](command:sensecode.settings "${l10n.t("Goto settings")}")`;
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
  let tip = new MarkdownString;
  tip.isTrusted = true;
  tip.supportThemeIcons = true;
  tip.appendMarkdown(`**SenseCode**\n\n`);
  tip.appendMarkdown(`***\n\n`);
  tip.appendMarkdown(`$(hubot) ${l10n.t("Code Engine")}: ${engine}\n\n`);
  tip.appendMarkdown(`$(zap) ${l10n.t("Trigger Mode")}: ${tmode}\n\n`);
  tip.appendMarkdown(`$(wand) ${l10n.t("Complition Mode")}: ${cmode}\n\n`);
  tip.appendMarkdown(`$(gear) ${l10n.t("All Settings")}: [${l10n.t("Open setting page")}](command:sensecode.settings "${l10n.t("Open setting page")}")\n\n`);
  if (err) {
    tip.appendMarkdown(`***\n\n`);
    tip.appendMarkdown(`$(bell) ${err}`);
  }
  return tip;
}

