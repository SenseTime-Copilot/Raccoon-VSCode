import * as vscode from "vscode";
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
import { HistoryCache } from "./utils/historyCache";
import { raccoonManager, telemetryReporter, initEnv, registerCommand, extensionNameKebab, raccoonEditorProviderViewType, raccoonSearchEditorProviderViewType, favoriteCodeEditorViewType, promptEditorViewType, agentEditorViewType } from "./globalEnv";
import { PromptEditor } from "./provider/promptManager";
import { AuthMethod, MetricType } from "./raccoonClient/CodeClient";
import { AgentEditor } from "./provider/agentManager";
import { getDocumentSymbols } from "./utils/collectionPromptInfo";

export let docSymbolMap: { [key: string]: { languageId: string; symbols: vscode.DocumentSymbol[] } } = {};

export async function activate(context: vscode.ExtensionContext) {
  let statusBarItem: vscode.StatusBarItem;

  await initEnv(context);

  FavoriteCodeEditor.register(context);
  AgentEditor.register(context);
  PromptEditor.register(context);

  await raccoonManager.initialClients();

  let validateInput = function (v: string) {
    return v ? undefined : "The value must not be empty";
  };

  registerCommand(context, "setAccessKey", () => {
    vscode.window.showInputBox({ placeHolder: "Access Key Id", password: true, validateInput, ignoreFocusOut: true }).then(async (accessKeyId) => {
      if (accessKeyId) {
        vscode.window.showInputBox({ placeHolder: "Secret Access Key", password: true, validateInput, ignoreFocusOut: true }).then(async (secretAccessKey) => {
          if (secretAccessKey) {
            raccoonManager.login({
              type: AuthMethod.accesskey,
              accessKeyId,
              secretAccessKey
            });
          }
        });
      }
    });
  });

  registerCommand(context, "setApiKey", () => {
    vscode.window.showInputBox({ placeHolder: "API Key", password: true, validateInput, ignoreFocusOut: true }).then(async (key) => {
      if (key) {
        raccoonManager.login({
          type: AuthMethod.apikey,
          apikey: key
        });
      }
    });
  });

  registerCommand(context, "help", async () => {
    vscode.commands.executeCommand("vscode.open", vscode.Uri.parse(`vscode:extension/${context.extension.id}`));
  });

  registerCommand(context, "favorite.manage", async () => {
    vscode.commands.executeCommand("vscode.openWith", vscode.Uri.parse(`${extensionNameKebab}://raccoon.favorites/all.raccoon.favorites?${encodeURIComponent(JSON.stringify({ title: vscode.l10n.t("Favorite Snippet") }))}`), favoriteCodeEditorViewType);
  });

  registerCommand(context, "agent.manage", async () => {
    vscode.commands.executeCommand("vscode.openWith", vscode.Uri.parse(`${extensionNameKebab}://raccoon.agent/all.raccoon.agent?${encodeURIComponent(JSON.stringify({ title: vscode.l10n.t("Custom Agent") }))}`), agentEditorViewType);
  });

  registerCommand(context, "prompt.manage", async () => {
    vscode.commands.executeCommand("vscode.openWith", vscode.Uri.parse(`${extensionNameKebab}://raccoon.prompt/all.raccoon.prompt?${encodeURIComponent(JSON.stringify({ title: vscode.l10n.t("Custom Prompt") }))}`), promptEditorViewType);
  });

  registerCommand(context, "terminal", async () => {
    new RaccoonTerminal(context);
  });

  registerCommand(context, "openEditor", async () => {
    let id = new Date().valueOf();
    let showOption: TextDocumentShowOptions | undefined = undefined;
    if (vscode.window.tabGroups.all.length === 1) {
      showOption = { viewColumn: vscode.ViewColumn.Beside };
    }
    vscode.commands.executeCommand('vscode.openWith',
      vscode.Uri.parse(`${extensionNameKebab}://raccoon.editor/assistant.raccoon?${id}`),
      raccoonEditorProviderViewType, showOption);
  });

  registerCommand(context, "settings.reset", async () => {
    raccoonManager.clear();
  });

  registerCommand(context, "inlineSuggest.trigger", async () => {
    let editor = vscode.window.activeTextEditor;
    if (!editor) {
    } else if (!editor.selection.isEmpty) {
      vscode.commands.executeCommand("editor.action.codeAction", { kind: vscode.CodeActionKind.QuickFix.append(extensionNameKebab).value });
    } else {
      vscode.commands.executeCommand("editor.action.inlineSuggest.trigger", vscode.window.activeTextEditor);
    }
  });

  registerCommand(context, "inlineSuggest.acceptLine", async () => {
    vscode.commands.executeCommand("editor.action.inlineSuggest.acceptNextLine");
  });

  registerCommand(context, "onSuggestionAccepted", (uri: vscode.Uri, languageid: string, _selection: string, range?: vscode.Range) => {
    let editor = vscode.window.activeTextEditor;
    if (range && editor) {
      let start = range.start.line;
      let end = range.end.line;
      decorateCodeWithRaccoonLabel(editor, start, end);
    }
    let usage: any = {};
    usage[languageid] = {
      // eslint-disable-next-line @typescript-eslint/naming-convention
      code_accept_num: 1
    };
    // eslint-disable-next-line @typescript-eslint/naming-convention
    telemetryReporter.logUsage(MetricType.codeCompletion, { code_accept_usage: { metrics_by_language: usage } });
  });

  // create a new status bar item that we can now manage
  statusBarItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Right,
    -1
  );

  statusBarItem.command = extensionNameKebab + ".settings";
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
      [{ scheme: "file" }, { scheme: "vscode-notebook-cell" }, { scheme: "vscode-userdata" }, { scheme: "untitled" }, { scheme: "git" }, { scheme: "vscode-remote" }],
      inlineProvider
    )
  );

  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor(async (editor) => {
      let enable = showHideStatusBtn(editor?.document, statusBarItem);
      if (!enable) {
        return;
      }
      for (let d of vscode.workspace.textDocuments) {
        if (d.uri.scheme === "file") {
          docSymbolMap[d.uri.toString()] = {
            languageId: d.languageId,
            symbols: await getDocumentSymbols(d.uri)
          };
        }
      }
    })
  );

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      `${extensionNameKebab}.view`,
      new RaccoonViewProvider(context),
      {
        webviewOptions: {
          retainContextWhenHidden: true,
        },
      }
    )
  );

  registerCommand(context, "chat.ask", () => {
    RaccoonViewProvider.ask();
  });

  context.subscriptions.push(
    vscode.languages.registerCodeActionsProvider(
      [{ scheme: "file" }, { scheme: "vscode-notebook-cell" }, { scheme: "vscode-userdata" }, { scheme: "untitled" }, { scheme: "git" }, { scheme: "vscode-remote" }],
      new RaccoonAction(context))
  );

  showHideStatusBtn(vscode.window.activeTextEditor?.document, statusBarItem);

  context.subscriptions.push(vscode.window.registerCustomEditorProvider(raccoonEditorProviderViewType, new RaccoonEditorProvider(context), {
    webviewOptions: { enableFindWidget: true, retainContextWhenHidden: true }
  }));

  context.subscriptions.push(vscode.window.registerCustomEditorProvider(raccoonSearchEditorProviderViewType, new RaccoonSearchEditorProvider(context), {
    webviewOptions: { enableFindWidget: true, retainContextWhenHidden: true }
  }));

  HistoryCache.register(context);

  DiffContentProvider.register(context);

  CodeNotebook.rigister(context);
}
export function deactivate() { }
