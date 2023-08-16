import { env } from 'vscode';
import { sensecodeManager } from '../extension';

export function buildHeader(action: string) {
  return {
    // eslint-disable-next-line @typescript-eslint/naming-convention
    "x-sensecode-identity": sensecodeManager.userId() || env.machineId,
    // eslint-disable-next-line @typescript-eslint/naming-convention
    "x-sensecode-action": action,
    // eslint-disable-next-line @typescript-eslint/naming-convention
    "x-sensecode-machine-id": env.machineId,
  };
}
