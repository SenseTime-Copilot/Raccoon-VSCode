import * as vscode from "vscode";
import { SenseCodeManager } from "./provider/sensecodeManager";
import { checkPrivacy } from "./utils/checkPrivacy";
import { updateStatusBarItem } from "./utils/updateStatusBarItem";
import { inlineCompletionProvider, showHideStatusBtn } from "./provider/inlineCompletionProvider";
import { SenseCodeViewProvider } from "./provider/webviewProvider";
import { SenseCodeAction } from "./provider/codeActionProvider";
import { SenseCodeEditorProvider } from "./provider/assitantEditorProvider";
import { decorateCodeWithSenseCodeLabel } from "./utils/decorateCode";
import { SenseCodeTerminal } from "./provider/codeTerminal";
import { SenseCodeTelemetry } from "./utils/telemetry";

let statusBarItem: vscode.StatusBarItem;
export let outlog: vscode.LogOutputChannel;
export let sensecodeManager: SenseCodeManager;
export let telemetryReporter: vscode.TelemetryLogger;
export let senseCodeTelemetry: SenseCodeTelemetry;

class SenseCodeUriHandler implements vscode.UriHandler {
  handleUri(uri: vscode.Uri): vscode.ProviderResult<void> {
    sensecodeManager.getTokenFromLoginResult(uri.toString()).then((ok) => {
      if (!ok) {
        SenseCodeViewProvider.showError(vscode.l10n.t("Login failed"));
      }
    });
  }
}

export async function activate(context: vscode.ExtensionContext) {
  outlog = vscode.window.createOutputChannel("SenseCode", { log: true });
  context.subscriptions.push(outlog);

  sensecodeManager = new SenseCodeManager(context);
  sensecodeManager.update();

  senseCodeTelemetry = new SenseCodeTelemetry(context);

  const sender: vscode.TelemetrySender = {
    flush() {
    },
    sendErrorData(_error, _data) {
    },
    sendEventData(_eventName, data) {
      if (data) {
        let ctx = data.context;
        let action = data.action;
        data.context = undefined;
        data.action = undefined;
        senseCodeTelemetry.sendTelemetry(action, data, ctx);
      }
    },
  };
  telemetryReporter = vscode.env.createTelemetryLogger(sender);

  checkPrivacy(context);

  let validateInput = function (v: string) {
    return v ? undefined : "The value must not be empty";
  };
  context.subscriptions.push(vscode.commands.registerCommand("sensecode.setAccessKey", () => {
    vscode.window.showInputBox({ placeHolder: "Access Key ID", password: true, validateInput, ignoreFocusOut: true }).then((ak) => {
      if (!ak) {
        return;
      }
      vscode.window.showInputBox({ placeHolder: "Secret Access Key", password: true, validateInput, ignoreFocusOut: true }).then((sk) => {
        if (ak && sk) {
          sensecodeManager.setAccessKey(ak, sk);
        }
      });
    });
  }));

  context.subscriptions.push(vscode.window.registerUriHandler(new SenseCodeUriHandler()));

  context.subscriptions.push(
    vscode.commands.registerCommand("sensecode.help", async () => {
      vscode.commands.executeCommand("vscode.open", vscode.Uri.parse(`vscode:extension/${context.extension.id}`));
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("sensecode.terminal", async () => {
      new SenseCodeTerminal(context);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("sensecode.openEditor", async () => {
      let id = new Date().valueOf();
      vscode.commands.executeCommand('vscode.openWith',
        vscode.Uri.parse(`sensecode://sensecode/assistant.sensecode?${id}`),
        SenseCodeEditorProvider.viewType);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("sensecode.settings.reset", async () => {
      sensecodeManager.clear();
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("sensecode.inlineSuggest.trigger", async () => {
      return vscode.commands.executeCommand("editor.action.inlineSuggest.trigger", vscode.window.activeTextEditor);
    })
  );

  context.subscriptions.push(
    // eslint-disable-next-line @typescript-eslint/naming-convention
    vscode.commands.registerCommand("sensecode.onSuggestionAccepted", (uri, range: vscode.Range, continueFlag, request, response, error, action, generate_at) => {
      let editor = vscode.window.activeTextEditor;
      if (editor) {
        let start = range.start.line;
        let end = range.end.line;
        decorateCodeWithSenseCodeLabel(editor, start, end);
      }
      telemetryReporter.logUsage("suggestion-accepted",
        {
          request,
          response,
          error,
          action,
          // eslint-disable-next-line @typescript-eslint/naming-convention
          generate_at,
          // eslint-disable-next-line @typescript-eslint/naming-convention
          report_at: new Date().valueOf()
        });
      if (continueFlag && sensecodeManager.autoComplete) {
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
      [{ scheme: "file" }, { scheme: "untitled" }, { scheme: "git" }],
      inlineProvider
    )
  );

  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor((editor) => {
      showHideStatusBtn(editor?.document, statusBarItem);
    })
  );

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      "sensecode.view",
      new SenseCodeViewProvider(context),
      {
        webviewOptions: {
          retainContextWhenHidden: true,
        },
      }
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("sensecode.ask", () => {
      SenseCodeViewProvider.ask();
    })
  );

  context.subscriptions.push(
    vscode.languages.registerCodeActionsProvider(
      [{ scheme: "file" }, { scheme: "untitled" }, { scheme: "git" }],
      new SenseCodeAction())
  );

  showHideStatusBtn(vscode.window.activeTextEditor?.document, statusBarItem);

  context.subscriptions.push(vscode.window.registerCustomEditorProvider(SenseCodeEditorProvider.viewType, new SenseCodeEditorProvider(context), {
    webviewOptions: { enableFindWidget: true, retainContextWhenHidden: true }
  }));

}
export function deactivate() { }
