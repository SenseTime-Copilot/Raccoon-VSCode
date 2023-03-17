import { workspace, window } from "vscode";
import { localeTag } from "../param/configures";

//check if the user accept to share codes
export async function checkPrivacy() {
    const configuration = workspace.getConfiguration("SenseCode", undefined);
    let privacy = configuration.get("Privacy");
    if (!privacy) {
        const selection = await window.showInformationMessage(
            localeTag.privacyInfo,
            localeTag.privacyAccept,
            localeTag.privacyDecline
        );
        if (selection !== undefined && selection === localeTag.privacyAccept) {
            configuration.update("Privacy", true, true);
            return true;
        }
        if (selection !== undefined && selection === localeTag.privacyDecline) {
            configuration.update("Privacy", false, true);
            return false;
        }
    } else {
        return true;
    }
}
