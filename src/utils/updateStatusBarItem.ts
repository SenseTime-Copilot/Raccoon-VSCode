import { StatusBarItem, MarkdownString, l10n, ThemeColor } from "vscode";
import { sensecodeManager } from "../extension";

var statusbartimer: NodeJS.Timeout;

export function updateStatusBarItem(
  statusBarItem: StatusBarItem,
  info?: {
    text: string;
    tooltip: string;
    keep?: boolean;
  }
) {
  statusBarItem.show();
  if (statusbartimer) {
    clearTimeout(statusbartimer);
  }
  if (sensecodeManager.isClientLoggedin()) {
    statusBarItem.color = new ThemeColor("statusBar.foreground");
    statusBarItem.backgroundColor = new ThemeColor("statusBar.background");
  } else {
    statusBarItem.color = new ThemeColor("statusBar.warningForeground");
    statusBarItem.backgroundColor = new ThemeColor("statusBarItem.warningBackground");
  }
  if (!info) {
    statusBarItem.text = "$(sensecode-icon)";
    statusBarItem.tooltip = buildTip();
    return;
  }

  statusBarItem.text = `$(sensecode-icon) $(dash) ${info.text}`;
  statusBarItem.tooltip = buildTip(info.tooltip);
  if (!info.keep) {
    statusbartimer = setTimeout(() => {
      statusBarItem.text = `$(sensecode-icon)`;
      statusBarItem.tooltip = buildTip();
    }, 10000);
  }

  function buildTip(msg?: string) {
    let tip = new MarkdownString;
    tip.supportThemeIcons = true;
    tip.supportHtml = true;
    if (sensecodeManager.isClientLoggedin()) {
      tip.appendMarkdown(`**SenseCode**\n\n`);
    } else {
      tip.appendMarkdown(`**SenseCode**    <code>${l10n.t("Unauthorized")}</code>\n\n`);
    }
    tip.appendMarkdown(`***\n\n`);
    tip.appendMarkdown(`<table>\n\n`);
    tip.appendMarkdown(`<tr><td align="left">$(server-environment) ${l10n.t("Code engine")}</td><td>  </td><td align="right">${sensecodeManager.getActiveClientLabel()}</td></tr>\n\n`);
    if (sensecodeManager.autoComplete) {
      tip.appendMarkdown(`<tr><td align="left">$(play) ${l10n.t("Trigger Mode")}</td><td>  </td><td align="right">${l10n.t("Auto")}</td></tr>\n\n`);
    } else {
      tip.appendMarkdown(`<tr><td align="left">$(keyboard) ${l10n.t("Trigger Mode")}</td><td>  </td><td align="right">${l10n.t("Manual")}</td></tr>\n\n`);
    }
    tip.appendMarkdown(`<tr><td align="left">$(dashboard) ${l10n.t("Completion Preference")}</td><td>  </td><td align="right">${l10n.t(sensecodeManager.completionPreference)}</td></tr>\n\n`);
    let candidate = sensecodeManager.candidates;
    if (candidate === 1) {
      tip.appendMarkdown(`<tr><td align="left">$(list-ordered) ${l10n.t("Max Candidate Number")}</td><td>  </td><td align="right">${l10n.t("1 candidate")}</td></tr>\n\n`);
    } else {
      tip.appendMarkdown(`<tr><td align="left">$(list-ordered) ${l10n.t("Max Candidate Number")}</td><td>  </td><td align="right">${l10n.t("{0} candidates", sensecodeManager.candidates)}</td></tr>\n\n`);
    }
    tip.appendMarkdown(`</table>\n\n`);
    if (msg) {
      tip.appendMarkdown(`***\n\n`);
      tip.appendMarkdown(`<table>\n\n`);
      tip.appendMarkdown(`<tr><td align="left">$(info) ${msg}</td></tr>\n\n`);
      tip.appendMarkdown(`</table>\n\n`);
    }
    return tip;
  }
}

