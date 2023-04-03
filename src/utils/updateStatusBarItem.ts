import { StatusBarItem, MarkdownString } from "vscode";

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
    statusBarItem.text = "$(sensecore-dark)";
    statusBarItem.tooltip = "SenseCode";
    return;
  }

  statusBarItem.text = `$(sensecore-dark) $(dash) ${info.text}`;
  statusBarItem.tooltip = info.tooltip;
  if (!info.keep) {
    statusbartimer = setTimeout(() => {
      statusBarItem.tooltip = "SenseCode";
      statusBarItem.text = `$(sensecore-dark)`;
    }, 10000);
  }
}

