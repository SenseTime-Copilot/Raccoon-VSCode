import { StatusBarItem, MarkdownString, ThemeColor } from "vscode";
import { extensionDisplayName, raccoonConfig, raccoonManager } from "../globalEnv";

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
  if (raccoonManager.isClientLoggedin()) {
    statusBarItem.color = new ThemeColor("statusBar.foreground");
    statusBarItem.backgroundColor = new ThemeColor("statusBar.background");
  } else {
    statusBarItem.color = new ThemeColor("statusBar.warningForeground");
    statusBarItem.backgroundColor = new ThemeColor("statusBarItem.warningBackground");
  }
  if (!info) {
    statusBarItem.text = "$(raccoon-icon)";
    statusBarItem.tooltip = buildTip();
    return;
  }

  statusBarItem.text = `$(raccoon-icon) $(dash) ${info.text}`;
  statusBarItem.tooltip = buildTip(info.tooltip);
  if (!info.keep) {
    statusbartimer = setTimeout(() => {
      statusBarItem.text = `$(raccoon-icon)`;
      statusBarItem.tooltip = buildTip();
    }, 10000);
  }

  function buildTip(msg?: string) {
    let tip = new MarkdownString;
    tip.supportThemeIcons = true;
    tip.supportHtml = true;
    tip.isTrusted = true;
    let login = raccoonManager.isClientLoggedin();
    if (!login) {
      tip.appendMarkdown(`**${extensionDisplayName}**    <code>${raccoonConfig.t("Unauthorized")}</code>\n\n`);
      return tip;
    }

    tip.appendMarkdown(`**${extensionDisplayName}**\n\n`);
    tip.appendMarkdown(`***\n\n`);
    tip.appendMarkdown(`<table>\n\n`);
    tip.appendMarkdown(`<tr><td align="left">$(server-environment) ${raccoonConfig.t("Code Engine")}</td><td>  </td><td align="right">${raccoonManager.getActiveClientRobotName()}</td></tr>\n\n`);
    if (raccoonManager.autoComplete) {
      let delay = raccoonManager.completionDelay === 0 ? raccoonConfig.t("Instant") : raccoonConfig.t("Delay {{delay}}s", { delay: raccoonManager.completionDelay / 1000 });
      tip.appendMarkdown(`<tr><td align="left">$(play) ${raccoonConfig.t("Trigger Delay")}</td><td>  </td><td align="right">${raccoonConfig.t("Auto")} (${delay})</td></tr>\n\n`);
    } else {
      tip.appendMarkdown(`<tr><td align="left">$(keyboard) ${raccoonConfig.t("Trigger Delay")}</td><td>  </td><td align="right">${raccoonConfig.t("Manual")}</td></tr>\n\n`);
    }
    tip.appendMarkdown(`<tr><td align="left">$(dashboard) ${raccoonConfig.t("Completion Preference")}</td><td>  </td><td align="right">${raccoonConfig.t(raccoonManager.completionPreference)}</td></tr>\n\n`);
    let candidate = raccoonManager.candidates;
    if (candidate === 1) {
      tip.appendMarkdown(`<tr><td align="left">$(list-ordered) ${raccoonConfig.t("Max Candidate Number")}</td><td>  </td><td align="right">${raccoonConfig.t("1 Candidate")}</td></tr>\n\n`);
    } else {
      tip.appendMarkdown(`<tr><td align="left">$(list-ordered) ${raccoonConfig.t("Max Candidate Number")}</td><td>  </td><td align="right">${raccoonConfig.t("{{candidateNum}} Candidates", { candidateNum: raccoonManager.candidates })}</td></tr>\n\n`);
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

