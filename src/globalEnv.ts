import * as vscode from "vscode";
import { RaccoonManager } from "./provider/raccoonManager";
import { RaccoonTelemetry } from "./utils/raccoonTelemetry";

export let outlog: vscode.LogOutputChannel;
export let raccoonManager: RaccoonManager;
export let telemetryReporter: vscode.TelemetryLogger;

export async function initEnv(context: vscode.ExtensionContext) {

  await vscode.workspace.fs.stat(context.globalStorageUri)
    .then(
      () => { },
      async () => {
        await vscode.workspace.fs.createDirectory(context.globalStorageUri);
      }
    );

  outlog = vscode.window.createOutputChannel("Raccoon", { log: true });
  context.subscriptions.push(outlog);

  raccoonManager = RaccoonManager.getInstance(context);
  raccoonManager.update();

  let raccoonTelemetry: RaccoonTelemetry = new RaccoonTelemetry(vscode.env.appName, vscode.env.machineId);

  const sender: vscode.TelemetrySender = {
    flush() {
    },
    sendErrorData(_error, _data) {
    },
    sendEventData(eventName, data) {
      let event = eventName;
      if (eventName) {
        if (eventName.startsWith(context.extension.id + "/")) {
          // eslint-disable-next-line no-unused-vars
          event = eventName.slice(context.extension.id.length + 1);
        }
        raccoonTelemetry?.sendTelemetry(event, data);
      }
    },
  };
  telemetryReporter = vscode.env.createTelemetryLogger(sender);
}