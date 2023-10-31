import { Extension, UIKind, env, version } from 'vscode';

export function buildHeader(extension: Extension<any>, action: string) {
  return {
    // eslint-disable-next-line @typescript-eslint/naming-convention
    "x-sensecode-ide": `${env.appName} ${version} ${env.uiKind === UIKind.Desktop ? 'Desktop' : 'Web'}`,
    // eslint-disable-next-line @typescript-eslint/naming-convention
    "x-sensecode-extension": `${extension.id}/${extension.packageJSON.version}`,
    // eslint-disable-next-line @typescript-eslint/naming-convention
    "x-sensecode-machine-id": env.machineId,
    // eslint-disable-next-line @typescript-eslint/naming-convention
    "x-sensecode-action": action
  };
}
