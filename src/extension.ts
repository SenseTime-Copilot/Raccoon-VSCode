import * as vscode from "vscode";
import { SenseCodeManager } from "./provider/sensecodeManager";
import { updateStatusBarItem } from "./utils/updateStatusBarItem";
import { inlineCompletionProvider, showHideStatusBtn } from "./provider/inlineCompletionProvider";
import { SenseCodeViewProvider } from "./provider/webviewProvider";
import { SenseCodeAction } from "./provider/codeActionProvider";
import { SenseCodeEditorProvider } from "./provider/assitantEditorProvider";
import { decorateCodeWithSenseCodeLabel } from "./utils/decorateCode";
import { SenseCodeTerminal } from "./provider/codeTerminal";
import { SenseCodeTelemetry } from "./utils/statsigTelemetry";
import { SenseCodeNotebook } from "./provider/notebook";
import DiffContentProvider from "./provider/diffContentProvider";

let statusBarItem: vscode.StatusBarItem;
export let outlog: vscode.LogOutputChannel;
export let sensecodeManager: SenseCodeManager;
export let telemetryReporter: vscode.TelemetryLogger;

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

  await vscode.workspace.fs.stat(context.globalStorageUri)
    .then(
      () => { },
      async () => {
        await vscode.workspace.fs.createDirectory(context.globalStorageUri);
      }
    );

  sensecodeManager = SenseCodeManager.getInstance(context);
  sensecodeManager.update();

  await sensecodeManager.initialClients();

  let senseCodeTelemetry: SenseCodeTelemetry = new SenseCodeTelemetry(vscode.env.appName, vscode.env.machineId);

  const sender: vscode.TelemetrySender = {
    flush() {
    },
    sendErrorData(_error, _data) {
    },
    sendEventData(eventName, data) {
      let devConfig = sensecodeManager.devConfig;
      // TODO: change to default on
      // if (devConfig && devConfig.telemetry === false) {
      if (!devConfig || devConfig.telemetry !== true) {
        return;
      }
      let event = eventName;
      if (eventName) {
        if (eventName.startsWith(context.extension.id + "/")) {
          event = eventName.slice(context.extension.id.length + 1);
        }
        senseCodeTelemetry?.sendTelemetry(event, data);
      }
    },
  };
  telemetryReporter = vscode.env.createTelemetryLogger(sender);

  let validateInput = function (v: string) {
    return v ? undefined : "The value must not be empty";
  };

  context.subscriptions.push(vscode.commands.registerCommand("sensecode.setAccessKey", () => {
    vscode.window.showInputBox({ placeHolder: "Access Key Id", password: true, validateInput, ignoreFocusOut: true }).then(async (accessKeyId) => {
      if (accessKeyId) {
        vscode.window.showInputBox({ placeHolder: "Secret Access Key", password: true, validateInput, ignoreFocusOut: true }).then(async (secretAccessKey) => {
          if (secretAccessKey) {
            sensecodeManager.getTokenFromLoginResult(`authorization://accesskey?${accessKeyId}&${secretAccessKey}`);
          }
        });
      }
    });
  }));

  context.subscriptions.push(vscode.commands.registerCommand("sensecode.setApiKey", () => {
    vscode.window.showInputBox({ placeHolder: "API Key", password: true, validateInput, ignoreFocusOut: true }).then(async (key) => {
      if (key) {
        sensecodeManager.getTokenFromLoginResult(`authorization://apikey?${key}`);
      }
    });
  }));

  context.subscriptions.push(vscode.window.registerUriHandler(new SenseCodeUriHandler()));

  context.subscriptions.push(
    vscode.commands.registerCommand("sensecode.help", async () => {
      vscode.commands.executeCommand("vscode.open", vscode.Uri.parse(`${vscode.env.uriScheme}:extension/${context.extension.id}`));
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("sensecode.terminal", async () => {
      new SenseCodeTerminal();
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
      let editor = vscode.window.activeTextEditor;
      if (!editor) {
      } else if (!editor.selection.isEmpty) {
        vscode.commands.executeCommand("editor.action.codeAction", { kind: vscode.CodeActionKind.QuickFix.append("sensecode").value });
      } else {
        vscode.commands.executeCommand("editor.action.inlineSuggest.trigger", vscode.window.activeTextEditor);
      }
    })
  );

  context.subscriptions.push(
    // eslint-disable-next-line @typescript-eslint/naming-convention
    vscode.commands.registerCommand("sensecode.onSuggestionAccepted", (uri, range: vscode.Range, continueFlag, selection) => {
      let editor = vscode.window.activeTextEditor;
      if (editor) {
        let start = range.start.line;
        let end = range.end.line;
        decorateCodeWithSenseCodeLabel(editor, start, end);
      }
      telemetryReporter.logUsage("suggestion accepted", { selection });
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
    -1
  );

  statusBarItem.command = "sensecode.settings";
  updateStatusBarItem(statusBarItem);

  sensecodeManager.onDidChangeStatus((_e) => {
    updateStatusBarItem(statusBarItem);
  });

  let inlineProvider: vscode.InlineCompletionItemProvider;

  inlineProvider = inlineCompletionProvider(
    context,
    statusBarItem
  );

  context.subscriptions.push(statusBarItem);

  context.subscriptions.push(
    vscode.languages.registerInlineCompletionItemProvider(
      [{ scheme: "file" }, { scheme: "vscode-notebook-cell" }, { scheme: "untitled" }, { scheme: "git" }],
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

  DiffContentProvider.register(context);

  SenseCodeNotebook.rigister(context);
}
export function deactivate() { }
