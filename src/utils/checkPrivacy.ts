import { window, ExtensionContext, l10n } from "vscode";

//check if the user accept to share codes
export async function checkPrivacy(context: ExtensionContext) {
  let privacy: boolean = context.globalState.get("privacy") || false;
  if (!privacy) {
    const selection = await window.showInformationMessage(
      l10n.t("We highly respect the privacy of your code. Do you accept sharing the generated code only for research purposes to make SenseCode  better? Otherwise, the code won't be stored and is only used to assist your programming."),
      l10n.t("Accept"),
      l10n.t("Decline")
    );
    if (selection !== undefined && selection === l10n.t("Accept")) {
      context.globalState.update("privacy", true);
      return true;
    }
    if (selection !== undefined && selection === l10n.t("Decline")) {
      context.globalState.update("privacy", false);
      return false;
    }
  } else {
    return true;
  }
}
