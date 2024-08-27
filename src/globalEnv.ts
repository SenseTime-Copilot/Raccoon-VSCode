import * as vscode from "vscode";
import { RaccoonManager } from "./provider/raccoonManager";
import { RaccoonConfig } from "./provider/config";
import { MetricType } from "./raccoonClient/CodeClient";

export let extensionDisplayName: string;
export let extensionNameKebab: string;
export let extensionNameCamel: string;
export let extensionNamePascal: string;
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

const CODE_COMPLETION_DATA_SEND_INTERVAL_MS = 30000;
const CODE_COMPLETION_DATA_CACHE_LENGTH = 100;
let telemetryCodeCompletionCacheData: Record<string, any> = {};
let telemetryCodeCompletionCacheCounter = 0;
let lastSendTimestamp = 0;

export function registerCommand(context: vscode.ExtensionContext, command: string, callback: (...args: any[]) => any, thisArg?: any) {
  return context.subscriptions.push(vscode.commands.registerCommand(`${extensionNameKebab}.${command}`, callback, thisArg));
}

function mergeRecords(record1: Record<string, any>, record2: Record<string, any>): Record<string, any> {
  const result: Record<string, any> = {};
  const keys = new Set([...Object.keys(record1), ...Object.keys(record2)]);

  keys.forEach(key => {
    const value1 = record1[key];
    const value2 = record2[key];

    if (typeof value1 === 'object' && typeof value2 === 'object') {
      result[key] = mergeRecords(value1, value2);
    } else if (typeof value1 === 'number' && typeof value2 === 'number') {
      result[key] = value1 + value2;
    } else if (value1 !== undefined) {
      result[key] = value1;
    } else if (value2 !== undefined) {
      result[key] = value2;
    }
  });

  return result;
}

export async function initEnv(context: vscode.ExtensionContext) {

  let packageJSON = context.extension.packageJSON;
  extensionNameKebab = packageJSON['name'].replace(/^@/g, '').replace(/[@~.\/]/g, '-');
  extensionNameCamel = extensionNameKebab.replace(/-./g, x => x[1].toUpperCase());
  extensionNamePascal = extensionNameCamel.charAt(0).toUpperCase() + extensionNameCamel.slice(1);
  extensionDisplayName = packageJSON['displayName'];
  extensionVersion = packageJSON['version'];

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

  outlog.debug(`------------------- ${context.extension.id}-${packageJSON.version} -------------------`);

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
        let sendData = data;
        if (event === MetricType.codeCompletion) {
          telemetryCodeCompletionCacheData = mergeRecords(telemetryCodeCompletionCacheData, data);
          telemetryCodeCompletionCacheCounter++;
          let ts = new Date().valueOf();
          if (((ts - lastSendTimestamp) < CODE_COMPLETION_DATA_SEND_INTERVAL_MS) && telemetryCodeCompletionCacheCounter < CODE_COMPLETION_DATA_CACHE_LENGTH) {
            return;
          }
          if (Object.keys(telemetryCodeCompletionCacheData)) {
            sendData = { ...telemetryCodeCompletionCacheData };
            Object.keys(telemetryCodeCompletionCacheData).forEach(key => delete telemetryCodeCompletionCacheData[key]);
          }
          telemetryCodeCompletionCacheCounter = 0;
          lastSendTimestamp = ts;
        }
        let common = {
          // eslint-disable-next-line @typescript-eslint/naming-convention
          client_agent: vscode.env.appName,
          // eslint-disable-next-line @typescript-eslint/naming-convention
          machine_id: vscode.env.machineId
        };
        try {
          raccoonManager.sendTelemetry(<MetricType>event, common, sendData).catch((e) => {
            console.error(e.message);
          });
        } catch (_e: any) {
        }
      }
    },
  };
  telemetryReporter = vscode.env.createTelemetryLogger(sender, { ignoreBuiltInCommonProperties: true });
}