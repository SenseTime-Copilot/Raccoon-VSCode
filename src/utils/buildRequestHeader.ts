import { Extension, UIKind, env, version } from 'vscode';
import { sensecodeManager } from '../extension';

export function buildHeader(extension: Extension<any>, action: string) {
  return {
    // eslint-disable-next-line @typescript-eslint/naming-convention
    "x-sensecode-identity": sensecodeManager.userId() || env.machineId,
    // eslint-disable-next-line @typescript-eslint/naming-convention
    "x-sensecode-action": action,
    // eslint-disable-next-line @typescript-eslint/naming-convention
    "x-sensecode-machine-id": env.machineId,
    // eslint-disable-next-line @typescript-eslint/naming-convention
    "x-sensecode-ide": `${env.appName} ${version} ${env.uiKind === UIKind.Desktop ? 'Desktop' : 'Web'}`,
    // eslint-disable-next-line @typescript-eslint/naming-convention
    "x-sensecode-client": `${extension.id}/${extension.packageJSON.version}`,
    // eslint-disable-next-line @typescript-eslint/naming-convention
    "x-sensecode-internal": 'false'
  };
}
