import { window, ExtensionContext } from "vscode";
import { localeTag } from "../param/configures";

//check if the user accept to share codes
export async function checkPrivacy(context: ExtensionContext) {
  let privacy: boolean = context.globalState.get("privacy") || false;
  if (!privacy) {
    const selection = await window.showInformationMessage(
      localeTag.privacyInfo,
      localeTag.privacyAccept,
      localeTag.privacyDecline
    );
    if (selection !== undefined && selection === localeTag.privacyAccept) {
      context.globalState.update("privacy", true);
      return true;
    }
    if (selection !== undefined && selection === localeTag.privacyDecline) {
      context.globalState.update("privacy", false);
      return false;
    }
  } else {
    return true;
  }
}
