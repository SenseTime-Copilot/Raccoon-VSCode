import * as vscode from "vscode";
import { RaccoonManager } from "./provider/raccoonManager";
import { RaccoonConfig } from "./provider/config";
import { MetricType } from "./raccoonClient/CodeClient";

export let extensionDisplayName: string;
export let extensionNameKebab: string;
export let extensionNameCamel: string;
export let extensionVersion: string;
export let raccoonEditorProviderViewType: string;
export let favoriteCodeEditorViewType: string;
export let promptEditorViewType: string;
export let agentEditorViewType: string;
export let raccoonSearchEditorProviderViewType: string;
export let codeNotebookType: string;
export let diffContentProviderScheme: string;
export let outlog: vscode.LogOutputChannel;
export let raccoonConfig: RaccoonConfig;
export let raccoonManager: RaccoonManager;
export let telemetryReporter: vscode.TelemetryLogger;

export function registerCommand(context: vscode.ExtensionContext, command: string, callback: (...args: any[]) => any, thisArg?: any) {
  return context.subscriptions.push(vscode.commands.registerCommand(`${extensionNameKebab}.${command}`, callback, thisArg));
}

export async function initEnv(context: vscode.ExtensionContext) {

  extensionNameKebab = context.extension.packageJSON['name'];
  extensionDisplayName = context.extension.packageJSON['displayName'];
  extensionNameCamel = context.extension.packageJSON['displayName'].replaceAll(' ', '');
  extensionVersion = context.extension.packageJSON['version'];

  raccoonEditorProviderViewType = `${extensionNameKebab}.editor`;
  favoriteCodeEditorViewType = `${extensionNameKebab}.favorites`;
  promptEditorViewType = `${extensionNameKebab}.promptManager`;
  agentEditorViewType = `${extensionNameKebab}.agentManager`;
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

  raccoonConfig = await RaccoonConfig.getInstance(context);

  raccoonManager = RaccoonManager.getInstance(context);
  raccoonManager.update();

  const sender: vscode.TelemetrySender = {
    flush() {
    },
    sendErrorData(_error, _data) {
    },
    async sendEventData(eventName, data) {
      let event = eventName;
      if (data && eventName) {
        if (eventName.startsWith(context.extension.id + "/")) {
          event = eventName.slice(context.extension.id.length + 1);
        }
        let common = {
          // eslint-disable-next-line @typescript-eslint/naming-convention
          client_agent: vscode.env.appName,
          // eslint-disable-next-line @typescript-eslint/naming-convention
          machine_id: vscode.env.machineId
        };
        try {
          raccoonManager.sendTelemetry(<MetricType>event, common, data).catch((e) => {
            console.error(e.message);
          });
        } catch (_e: any) {
        }
      }
    },
  };
  telemetryReporter = vscode.env.createTelemetryLogger(sender, { ignoreBuiltInCommonProperties: true });
}