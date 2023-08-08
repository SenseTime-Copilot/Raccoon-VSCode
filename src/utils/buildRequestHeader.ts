import { Extension, env, version, UIKind } from 'vscode';

export function buildHeader(extension: Extension<any>, username: string, action: string) {
  return {
    // eslint-disable-next-line @typescript-eslint/naming-convention
    "x-sensecode-identity": username,
    // eslint-disable-next-line @typescript-eslint/naming-convention
    "x-sensecode-action": action,
    // eslint-disable-next-line @typescript-eslint/naming-convention
    "x-sensecode-machine-id": env.machineId,
    // eslint-disable-next-line @typescript-eslint/naming-convention
    "x-sensecode-client": `${extension.packageJSON.version} (${env.appName} ${version} ${env.uiKind === UIKind.Desktop ? 'Desktop' : 'Web'})`
  };
}
