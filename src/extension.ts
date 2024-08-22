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
import { raccoonManager, telemetryReporter, initEnv, registerCommand, extensionNameKebab, raccoonEditorProviderViewType, raccoonSearchEditorProviderViewType, favoriteCodeEditorViewType, promptEditorViewType, agentEditorViewType, raccoonConfig, extensionDisplayName } from "./globalEnv";
import { PromptEditor } from "./provider/promptManager";
import { AuthMethod, MetricType } from "./raccoonClient/CodeClient";
import { AgentEditor } from "./provider/agentManager";
import { getDocumentSymbols } from "./utils/collectionPromptInfo";
import { CommitMessageSuggester } from "./provider/commitMessagSuggestion";
// import { RaccoonCodelensProvider } from "./provider/codeLensProvider";

export let docSymbolMap: { [key: string]: { languageId: string; symbols: vscode.DocumentSymbol[] } } = {};

class RaccoonUriHandler implements vscode.UriHandler {
  handleUri(uri: vscode.Uri): vscode.ProviderResult<void> {
    raccoonManager.login({ type: AuthMethod.browser, callback: uri.query, appName: extensionDisplayName });
  }
}

export async function activate(context: vscode.ExtensionContext) {
  let statusBarItem: vscode.StatusBarItem;

  await initEnv(context);

  FavoriteCodeEditor.register(context);
  AgentEditor.register(context);
  PromptEditor.register(context);

  await raccoonManager.initialClients();

  context.subscriptions.push(vscode.window.registerUriHandler(new RaccoonUriHandler()));

  let validateInput = function (v: string) {
    return v ? undefined : "The value must not be empty";
  };

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
    vscode.commands.executeCommand("vscode.openWith", vscode.Uri.parse(`${extensionNameKebab}://raccoon.favorites/all.raccoon.favorites?${encodeURIComponent(JSON.stringify({ title: raccoonConfig.t("Favorite Snippet") }))}`), favoriteCodeEditorViewType);
  });

  registerCommand(context, "agent.manage", async () => {
    vscode.commands.executeCommand("vscode.openWith", vscode.Uri.parse(`${extensionNameKebab}://raccoon.agent/all.raccoon.agent?${encodeURIComponent(JSON.stringify({ title: raccoonConfig.t("Custom Agent") }))}`), agentEditorViewType);
  });

  registerCommand(context, "prompt.manage", async () => {
    vscode.commands.executeCommand("vscode.openWith", vscode.Uri.parse(`${extensionNameKebab}://raccoon.prompt/all.raccoon.prompt?${encodeURIComponent(JSON.stringify({ title: raccoonConfig.t("Custom Prompt") }))}`), promptEditorViewType);
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

  registerCommand(context, "onSuggestionAccepted", (uri: vscode.Uri, languageid: string, _selection: string, line: number, range?: vscode.Range) => {
    let editor = vscode.window.activeTextEditor;
    if (range && editor) {
      let start = range.start.line;
      let end = range.end.line;
      decorateCodeWithRaccoonLabel(editor, start, end);
    }
    let usage: any = {};
    usage[languageid] = {
      // eslint-disable-next-line @typescript-eslint/naming-convention
      code_accept_num: 1,
      // eslint-disable-next-line @typescript-eslint/naming-convention
      code_accept_line_num: line
    };
    // eslint-disable-next-line @typescript-eslint/naming-convention
    telemetryReporter.logUsage(MetricType.codeCompletion, { code_accept_usage: { metrics_by_language: usage } });
  });

  // create a new status bar item that we can now manage
  statusBarItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Right,
    -1
  );

  CommitMessageSuggester.registerCommitMessageCommand(context);

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

  /*
  context.subscriptions.push(
    vscode.languages.registerCodeLensProvider(
      "*",
      new RaccoonCodelensProvider()
    )
  );

  registerCommand(context, "codelensAction", async (range: vscode.Range) => {
    let editor = vscode.window.activeTextEditor;
    if (editor && editor.document) {
      vscode.window.showTextDocument(editor?.document, { selection: range });
    }
  });
  */

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

  registerCommand(context, "displayLanguage", () => {
    const quickPick = vscode.window.createQuickPick();
    let curLang = context.globalState.get("DisplayLanguage", undefined);
    let items =
      [
        {
          label: (curLang === undefined ? "$(check) " : "$(blank) ") + raccoonConfig.t("Follow VS Code Settings")
        },
        {
          label: "",
          kind: vscode.QuickPickItemKind.Separator,
        },
        {
          label: (curLang === "en" ? "$(check) " : "$(blank) ") + "English",
          description: "en",
        },
        {
          label: (curLang === "zh-cn" ? "$(check) " : "$(blank) ") + "中文(简体)",
          description: "zh-cn",
        },
        {
          label: (curLang === "zh-tw" ? "$(check) " : "$(blank) ") + "中文(繁體)",
          description: "zh-tw",
        },
        {
          label: (curLang === "ja" ? "$(check) " : "$(blank) ") + "日本語",
          description: "ja",
        }
      ];
    quickPick.items = items;
    quickPick.placeholder = "Raccoon: " + raccoonConfig.t("Select Display Language");
    quickPick.onDidHide(() => quickPick.dispose());
    quickPick.onDidChangeSelection(selection => {
      if (selection[0]) {
        if (selection[0].description === curLang) {
          return;
        } else {
          const title: { [key: string]: string } = {
            "en": "Changing Display Language to English",
            // eslint-disable-next-line @typescript-eslint/naming-convention
            "zh-cn": "更改显示语言为简体中文",
            // eslint-disable-next-line @typescript-eslint/naming-convention
            "zh-tw": "更改顯示語言為繁體中文",
            "ja": "表示言語を日本語に変更する"
          };
          const warn: { [key: string]: string } = {
            "en": "Changing the display language settings will take effect after VS Code restarts, do you still continue?",
            // eslint-disable-next-line @typescript-eslint/naming-convention
            "zh-cn": "更改显示语言设置将会在 VS Code 重启后生效, 确认更改吗?",
            // eslint-disable-next-line @typescript-eslint/naming-convention
            "zh-tw": "更改顯示語言設置將在 VSCode 重啟後生效，確認更改嗎？",
            "ja": "表示言語設定の変更は、VS Code の再起動後に有効になりますが、変更は確認されていますか?"
          };
          const accept: { [key: string]: string } = {
            "en": "Restart",
            // eslint-disable-next-line @typescript-eslint/naming-convention
            "zh-cn": "重启",
            // eslint-disable-next-line @typescript-eslint/naming-convention
            "zh-tw": "重啟",
            "ja": "再起動"
          };
          let detail = '';
          if (selection[0].description) {
            detail += warn[selection[0].description] + "\n";
          }
          if (curLang) {
            detail += warn[curLang] + "\n";
          }
          let acceptBtn = accept[selection[0].description || curLang || "en"];
          vscode.window.showWarningMessage(title[selection[0].description || curLang || "en"], { modal: true, detail }, acceptBtn).then((v) => {
            if (v === acceptBtn) {
              context.globalState.update(`DisplayLanguage`, selection[0].description).then(() => {
                vscode.commands.executeCommand("workbench.action.reloadWindow");
              });
            }
          });
        }
        quickPick.dispose();
      }
    });
    quickPick.show();
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
