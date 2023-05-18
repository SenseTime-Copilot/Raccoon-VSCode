import * as vscode from "vscode";
import { Configuration } from "./param/configures";
import { checkPrivacy } from "./utils/checkPrivacy";
import { updateStatusBarItem } from "./utils/updateStatusBarItem";
import { inlineCompletionProvider, showHideStatusBtn } from "./provider/inlineCompletionProvider";
import { SenseCodeViewProvider } from "./provider/webviewProvider";
import { SenseCodeAction } from "./provider/codeActionProvider";
import { sendTelemetryLog } from "./utils/getCodeCompletions";
import { SenseCodeEidtorProvider } from "./provider/assitantEditorProvider";
import jwt_decode from "jwt-decode";

//import { KeyCalculator } from "./provider/keyCalculator";

let statusBarItem: vscode.StatusBarItem;
export let outlog: vscode.LogOutputChannel;
export let configuration: Configuration;
export let telemetryReporter: vscode.TelemetryLogger;

class SenseCodeUriHandler implements vscode.UriHandler {
  handleUri(uri: vscode.Uri): vscode.ProviderResult<void> {
    if (uri.query) {
      let decoded:any = jwt_decode(uri.query);
      let s1 = Buffer.from(`0#${decoded.username}#67pnbtbheuJyBZmsx9rz`).toString('base64');
      let s2 = ["O","T","V","G","N","k","V","D","O","U","Y","0","O","E","N","D","M","D","k","4","N","E","Y","1","N","j","J","E","Q","U","Y","5","R","T","U","x","M","j","A","w","N","D","E","j","N","T","c","x","N","j","B","D","R","T","A","2","M","E","I","y","N","j","Y","5","N","E","Q","1","N","U","R","C","N","T","I","z","M","T","A","y","M","z","c","y","M","E","U"];
      s1 = s1.split("=")[0];
      let len = Math.max(s1.length, s2.length);
      let key = '';
      for (let i = 0; i < len; i++) {
        if (i < s1.length) {
          key += s1[i];
        }
        if (i === s1.length) {
          key += ',';
        }
        if (i < s2.length) {
          key += s2[i];
        }
      }
      configuration.setApiKey(configuration.getActiveEngineInfo().label, key);
    }
  }
}

export async function activate(context: vscode.ExtensionContext) {
  outlog = vscode.window.createOutputChannel(vscode.l10n.t("SenseCode"), { log: true });
  context.subscriptions.push(outlog);

  const sender: vscode.TelemetrySender = {
    flush() {
    },
    sendErrorData(_error, _data) {
    },
    sendEventData(eventName, data) {
      if (data) {
        sendTelemetryLog(eventName, data);
      }
    },
  };
  telemetryReporter = vscode.env.createTelemetryLogger(sender);

  configuration = new Configuration(context);
  configuration.update();

  checkPrivacy(context);

  context.subscriptions.push(vscode.window.registerUriHandler(new SenseCodeUriHandler()));

  context.subscriptions.push(
    vscode.commands.registerCommand("sensecode.openEditor", async () => {
      let tabs = vscode.window.tabGroups.all;
      vscode.commands.executeCommand('vscode.openWith',
        vscode.Uri.parse("file://sensecode/assistant.sensecode"),
        SenseCodeEidtorProvider.viewType,
        { viewColumn: tabs.length + 1 });
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("sensecode.inlineSuggest.trigger", async () => {
      return vscode.commands.executeCommand("editor.action.inlineSuggest.trigger", vscode.window.activeTextEditor);
    })
  );

  context.subscriptions.push(
    // eslint-disable-next-line @typescript-eslint/naming-convention
    vscode.commands.registerCommand("sensecode.onSuggestionAccepted", (request, response, error, action, generate_at) => {
      telemetryReporter.logUsage("suggestion-accepted",
        {
          event: "suggestion-accepted",
          request,
          response,
          error,
          action,
          // eslint-disable-next-line @typescript-eslint/naming-convention
          generate_at,
          // eslint-disable-next-line @typescript-eslint/naming-convention
          report_at: new Date().valueOf()
        });
      if (configuration.autoComplete || configuration.completeLine) {
        setTimeout(() => {
          vscode.commands.executeCommand("editor.action.inlineSuggest.trigger", vscode.window.activeTextEditor);
        }, 1000);
      }
    })
  );

  // create a new status bar item that we can now manage
  statusBarItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Right,
    100
  );
  statusBarItem.color = new vscode.ThemeColor("statusBar.remoteForeground");
  statusBarItem.backgroundColor = new vscode.ThemeColor("statusBar.remoteBackground");
  statusBarItem.command = "sensecode.settings";
  updateStatusBarItem(statusBarItem);

  let inlineProvider: vscode.InlineCompletionItemProvider;

  inlineProvider = inlineCompletionProvider(
    context,
    statusBarItem
  );

  context.subscriptions.push(statusBarItem);

  context.subscriptions.push(
    vscode.languages.registerInlineCompletionItemProvider(
      [{ scheme: "file" }, { scheme: "untitled" }],
      inlineProvider
    )
  );

  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor((editor) => {
      showHideStatusBtn(editor?.document, statusBarItem);
    })
  );

  const view = vscode.window.registerWebviewViewProvider(
    "sensecode.view",
    new SenseCodeViewProvider(context),
    {
      webviewOptions: {
        retainContextWhenHidden: true,
      },
    }
  );
  context.subscriptions.push(view);

  context.subscriptions.push(
    vscode.languages.registerCodeActionsProvider(
      [{ scheme: "file" }, { scheme: "untitled" }],
      new SenseCodeAction())
  );

  showHideStatusBtn(vscode.window.activeTextEditor?.document, statusBarItem);

  context.subscriptions.push(vscode.window.registerCustomEditorProvider(SenseCodeEidtorProvider.viewType, new SenseCodeEidtorProvider(context), {
    supportsMultipleEditorsPerDocument: true,
    webviewOptions: { enableFindWidget: true, retainContextWhenHidden: true }
  }));

  // new KeyCalculator();
}
export function deactivate() { }
