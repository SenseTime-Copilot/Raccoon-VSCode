import { StatusBarItem, MarkdownString, l10n } from "vscode";

var statusbartimer: NodeJS.Timeout;

export function updateStatusBarItem(
  statusBarItem: StatusBarItem,
  info?: {
    text: string;
    tooltip: string | MarkdownString | undefined;
    keep?: boolean;
  }
) {
  statusBarItem.show();
  if (statusbartimer) {
    clearTimeout(statusbartimer);
  }
  if (!info) {
    statusBarItem.text = "$(sensecode-icon)";
    statusBarItem.tooltip = l10n.t("SenseCode");
    return;
  }

  statusBarItem.text = `$(sensecode-icon) $(dash) ${info.text}`;
  statusBarItem.tooltip = info.tooltip;
  if (!info.keep) {
    statusbartimer = setTimeout(() => {
      statusBarItem.text = `$(sensecode-icon)`;
      statusBarItem.tooltip = l10n.t("SenseCode");
    }, 10000);
  }
}

