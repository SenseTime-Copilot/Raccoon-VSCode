import * as vscode from "vscode";
import { RaccoonManager } from "./provider/raccoonManager";
import { updateStatusBarItem } from "./utils/updateStatusBarItem";
import { inlineCompletionProvider, showHideStatusBtn } from "./provider/inlineCompletionProvider";
import { RaccoonViewProvider } from "./provider/webviewProvider";
import { RaccoonAction } from "./provider/codeActionProvider";
import { RaccoonEditorProvider } from "./provider/assitantEditorProvider";
import { decorateCodeWithRaccoonLabel } from "./utils/decorateCode";
import { RaccoonTerminal } from "./provider/codeTerminal";
import DiffContentProvider from "./provider/diffContentProvider";
import { TextDocumentShowOptions } from "vscode";
import { RaccoonSearchEditorProvider } from "./provider/searchEditorProvider";
import { FavoriteCodeEditor } from "./provider/favoriteCode";
import { CodeNotebook } from "./provider/codeNotebook";

let statusBarItem: vscode.StatusBarItem;
export let outlog: vscode.LogOutputChannel;
export let raccoonManager: RaccoonManager;
export let telemetryReporter: vscode.TelemetryLogger;

class RaccoonUriHandler implements vscode.UriHandler {
  handleUri(uri: vscode.Uri): vscode.ProviderResult<void> {
    raccoonManager.getTokenFromLoginResult(uri.toString()).then((ok) => {
      if (!ok) {
        RaccoonViewProvider.showError(vscode.l10n.t("Login failed"));
      }
    });
  }
}

export async function activate(context: vscode.ExtensionContext) {
  outlog = vscode.window.createOutputChannel("Raccoon", { log: true });
  context.subscriptions.push(outlog);

  await vscode.workspace.fs.stat(context.globalStorageUri)
    .then(
      () => { },
      async () => {
        await vscode.workspace.fs.createDirectory(context.globalStorageUri);
      }
    );

  FavoriteCodeEditor.register(context);

  raccoonManager = RaccoonManager.getInstance(context);
  raccoonManager.update();

  await raccoonManager.initialClients();

  const sender: vscode.TelemetrySender = {
    flush() {
    },
    sendErrorData(_error, _data) {
    },
    sendEventData(eventName, _data) {
      let event = eventName;
      if (eventName) {
        if (eventName.startsWith(context.extension.id + "/")) {
          // eslint-disable-next-line no-unused-vars
          event = eventName.slice(context.extension.id.length + 1);
        }
        //raccoonTelemetry?.sendTelemetry(event, data);
      }
    },
  };
  telemetryReporter = vscode.env.createTelemetryLogger(sender);

  let validateInput = function (v: string) {
    return v ? undefined : "The value must not be empty";
  };

  context.subscriptions.push(vscode.commands.registerCommand("raccoon.setAccessKey", () => {
    vscode.window.showInputBox({ placeHolder: "Access Key Id", password: true, validateInput, ignoreFocusOut: true }).then(async (accessKeyId) => {
      if (accessKeyId) {
        vscode.window.showInputBox({ placeHolder: "Secret Access Key", password: true, validateInput, ignoreFocusOut: true }).then(async (secretAccessKey) => {
          if (secretAccessKey) {
            raccoonManager.getTokenFromLoginResult(`authorization://accesskey?${accessKeyId}&${secretAccessKey}`);
          }
        });
      }
    });
  }));

  context.subscriptions.push(vscode.commands.registerCommand("raccoon.setApiKey", () => {
    vscode.window.showInputBox({ placeHolder: "API Key", password: true, validateInput, ignoreFocusOut: true }).then(async (key) => {
      if (key) {
        raccoonManager.getTokenFromLoginResult(`authorization://apikey?${key}`);
      }
    });
  }));

  context.subscriptions.push(vscode.window.registerUriHandler(new RaccoonUriHandler()));

  context.subscriptions.push(
    vscode.commands.registerCommand("raccoon.help", async () => {
      vscode.commands.executeCommand("vscode.open", vscode.Uri.parse(`${vscode.env.uriScheme}:extension/${context.extension.id}`));
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("raccoon.favorite.manage", async () => {
      vscode.commands.executeCommand("vscode.openWith", vscode.Uri.parse(`raccoon://raccoon.favorites/all.raccoon.favorites?${encodeURIComponent(JSON.stringify({ title: "Favorite Snipets" }))}`), FavoriteCodeEditor.viweType);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("raccoon.terminal", async () => {
      new RaccoonTerminal(context);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("raccoon.openEditor", async () => {
      let id = new Date().valueOf();
      let showOption: TextDocumentShowOptions | undefined = undefined;
      if (vscode.window.tabGroups.all.length === 1) {
        showOption = { viewColumn: vscode.ViewColumn.Beside };
      }
      vscode.commands.executeCommand('vscode.openWith',
        vscode.Uri.parse(`raccoon://raccoon.editor/assistant.raccoon?${id}`),
        RaccoonEditorProvider.viewType, showOption);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("raccoon.settings.reset", async () => {
      raccoonManager.clear();
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("raccoon.inlineSuggest.trigger", async () => {
      let editor = vscode.window.activeTextEditor;
      if (!editor) {
      } else if (!editor.selection.isEmpty) {
        vscode.commands.executeCommand("editor.action.codeAction", { kind: vscode.CodeActionKind.QuickFix.append("raccoon").value });
      } else {
        vscode.commands.executeCommand("editor.action.inlineSuggest.trigger", vscode.window.activeTextEditor);
      }
    })
  );

  context.subscriptions.push(
    // eslint-disable-next-line @typescript-eslint/naming-convention
    vscode.commands.registerCommand("raccoon.onSuggestionAccepted", (uri, range: vscode.Range, continueFlag, selection) => {
      let editor = vscode.window.activeTextEditor;
      if (editor) {
        let start = range.start.line;
        let end = range.end.line;
        decorateCodeWithRaccoonLabel(editor, start, end);
      }
      telemetryReporter.logUsage("suggestion accepted", { selection });
      if (continueFlag && raccoonManager.autoComplete) {
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

  statusBarItem.command = "raccoon.settings";
  updateStatusBarItem(statusBarItem);

  raccoonManager.onDidChangeStatus((_e) => {
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
      "raccoon.view",
      new RaccoonViewProvider(context),
      {
        webviewOptions: {
          retainContextWhenHidden: true,
        },
      }
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("raccoon.ask", () => {
      RaccoonViewProvider.ask();
    })
  );

  context.subscriptions.push(
    vscode.languages.registerCodeActionsProvider(
      [{ scheme: "file" }, { scheme: "untitled" }, { scheme: "git" }],
      new RaccoonAction())
  );

  showHideStatusBtn(vscode.window.activeTextEditor?.document, statusBarItem);

  context.subscriptions.push(vscode.window.registerCustomEditorProvider(RaccoonEditorProvider.viewType, new RaccoonEditorProvider(context), {
    webviewOptions: { enableFindWidget: true, retainContextWhenHidden: true }
  }));

  context.subscriptions.push(vscode.window.registerCustomEditorProvider(RaccoonSearchEditorProvider.viewType, new RaccoonSearchEditorProvider(context), {
    webviewOptions: { enableFindWidget: true, retainContextWhenHidden: true }
  }));

  DiffContentProvider.register(context);

  CodeNotebook.rigister(context);
}
export function deactivate() { }
