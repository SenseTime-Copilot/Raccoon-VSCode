import axios from "axios";
import { env, UIKind } from "vscode";

export async function checkSensetimeEnv(): Promise<boolean> {
  if (env.uiKind === UIKind.Web) {
    return false;
  }
  return axios.get(`https://sso.sensetime.com/enduser/sp/sso/`)
    .then(() => {
      return true;
    })
    .catch(async (e) => {
      if (e.response?.status === 500) {
        return true;
      }
      return false;
    });
}
