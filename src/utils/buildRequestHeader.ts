import { Extension, UIKind, env, version } from 'vscode';

export function buildHeader(extension: Extension<any>, action: string, id: string) {
  return {
    // eslint-disable-next-line @typescript-eslint/naming-convention
    "x-raccoon-ide": `${env.appName} ${version} ${env.uiKind === UIKind.Desktop ? 'Desktop' : 'Web'}`,
    // eslint-disable-next-line @typescript-eslint/naming-convention
    "x-raccoon-extension": `${extension.id}/${extension.packageJSON.version}`,
    // eslint-disable-next-line @typescript-eslint/naming-convention
    "x-raccoon-machine-id": env.machineId,
    // eslint-disable-next-line @typescript-eslint/naming-convention
    "x-raccoon-turn-id": `${env.sessionId}-${id}`,
    // eslint-disable-next-line @typescript-eslint/naming-convention
    "x-raccoon-action": action
  };
}
