import * as vscode from "vscode";
import { RaccoonManager } from "./provider/raccoonManager";
import { RaccoonTelemetry } from "./provider/contants";

export let extensionDisplayName: string;
export let extensionNameKebab: string;
export let extensionNameCamel: string;
export let raccoonEditorProviderViewType: string;
export let favoriteCodeEditorViewType: string;
export let promptEditorViewType: string;
export let raccoonSearchEditorProviderViewType: string;
export let codeNotebookType: string;
export let diffContentProviderScheme: string;
export let outlog: vscode.LogOutputChannel;
export let raccoonManager: RaccoonManager;
export let telemetryReporter: vscode.TelemetryLogger;

export function registerCommand(context: vscode.ExtensionContext, command: string, callback: (...args: any[]) => any, thisArg?: any) {
  return context.subscriptions.push(vscode.commands.registerCommand(`${extensionNameKebab}.${command}`, callback, thisArg));
}

export async function initEnv(context: vscode.ExtensionContext) {

  extensionNameKebab = context.extension.packageJSON['name'];
  extensionDisplayName = context.extension.packageJSON['displayName'];
  extensionNameCamel = context.extension.packageJSON['displayName'].replace(' ', '');

  raccoonEditorProviderViewType = `${extensionNameKebab}.editor`;
  favoriteCodeEditorViewType = `${extensionNameKebab}.favorites`;
  promptEditorViewType = `${extensionNameKebab}.promptManager`;
  raccoonSearchEditorProviderViewType = `${extensionNameKebab}.search`;
  codeNotebookType = extensionNameKebab;
  diffContentProviderScheme = `${extensionNameKebab}-diff`;

  await vscode.workspace.fs.stat(context.globalStorageUri)
    .then(
      () => { },
      async () => {
        await vscode.workspace.fs.createDirectory(context.globalStorageUri);
      }
    );

  outlog = vscode.window.createOutputChannel(extensionDisplayName, { log: true });
  context.subscriptions.push(outlog);

  let logDir = vscode.Uri.joinPath(context.globalStorageUri, `usage`);
  outlog.debug(logDir.toString());

  raccoonManager = RaccoonManager.getInstance(context);
  raccoonManager.update();

  let raccoonTelemetry: RaccoonTelemetry = new RaccoonTelemetry();

  const sender: vscode.TelemetrySender = {
    flush() {
    },
    sendErrorData(_error, _data) {
    },
    async sendEventData(eventName, data) {
      let event = eventName;
      if (data && eventName) {
        if (eventName.startsWith(context.extension.id + "/")) {
          // eslint-disable-next-line no-unused-vars
          event = eventName.slice(context.extension.id.length + 1);
        }
        let user = {
          userID: raccoonManager.userId() || vscode.env.machineId,
          userAgent: vscode.env.appName
        };
        raccoonTelemetry?.sendTelemetry(event, user, data);
      }
    },
  };
  telemetryReporter = vscode.env.createTelemetryLogger(sender);
}