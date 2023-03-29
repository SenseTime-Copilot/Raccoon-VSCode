import { StatusBarItem, MarkdownString } from "vscode";

var statusbartimer: NodeJS.Timeout;

export async function updateStatusBarItem(
  statusBarItem: StatusBarItem,
  extraIcon?: string,
  errText?: string
): Promise<void> {
  statusBarItem.show();
  if (statusbartimer) {
    clearTimeout(statusbartimer);
  }
  statusBarItem.text = "$(sensecore-dark)";
  if (extraIcon) {
    statusBarItem.text = `$(sensecore-dark) - $(${extraIcon})`;
    statusBarItem.tooltip = new MarkdownString(`$(bell) ${errText}`);
    statusBarItem.tooltip.supportThemeIcons = true;
  }

  if (extraIcon !== "sync~spin") {
    statusbartimer = setTimeout(() => {
      statusBarItem.tooltip = undefined;
      statusBarItem.text = `$(sensecore-dark)`;
    }, 10000);
  }
}

