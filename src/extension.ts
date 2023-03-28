import * as vscode from "vscode";
import { Configuration, Engine } from "./param/configures";
import { checkPrivacy } from "./utils/checkPrivacy";
import { updateStatusBarItem } from "./utils/updateStatusBarItem";
import { getDocumentLanguage, inlineCompletionProvider, showHideStatusBtn } from "./provider/inlineCompletionProvider";
import { SenseCodeViewProvider } from "./provider/webviewProvider";

let statusBarItem: vscode.StatusBarItem;

export async function activate(context: vscode.ExtensionContext) {
  new Configuration();
  vscode.commands.executeCommand("setContext", "sensecode.next.chat", Configuration.next.chat === true);
  context.globalState.update("privacy", false);

  let activeEngine: Engine | undefined = context.globalState.get("engine");
  let engines = Configuration.engines;
  if (activeEngine) {
    let es = engines.filter((e) => {
      return e.label === activeEngine!.label;
    });
    if (es.length !== 0) {
      activeEngine = es[0];
    }
  }
  if (!activeEngine) {
    activeEngine = engines[0];
  }
  context.globalState.update("engine", activeEngine);

  vscode.workspace.onDidChangeConfiguration(async (e) => {
    if (e.affectsConfiguration("SenseCode")) {
      Configuration.update();
      let es = Configuration.engines;
      let ae: Engine | undefined = context.globalState.get("engine");
      if (ae) {
        let newEngine = es.filter((v) => {
          return v.label === ae?.label;
        });
        activeEngine = newEngine[0];
      } else if (es.length !== 0) {
        activeEngine = es[0];
      }
      context.globalState.update("engine", activeEngine);
      updateStatusBarItem(context, statusBarItem);
      vscode.commands.executeCommand("setContext", "sensecode.next.chat", Configuration.next.chat === true);
    }
  });
  checkPrivacy(context);

  async function checkEngineKey() {
    if (!activeEngine) {
      return;
    }
    if (activeEngine.key === undefined) {
      let k = await context.secrets.get("sensecode.key");
      if (k) {
        activeEngine.key = k;
      } else {
        return vscode.window.showInputBox({ title: `${vscode.l10n.t("SenseCode: Input your Key...")}`, ignoreFocusOut: true }).then(async (v) => {
          if (v) {
            await context.secrets.store("sensecode.key", v);
            activeEngine!.key = v;
          }
        });
      }
    }
  }

  context.subscriptions.push(
    vscode.commands.registerCommand("sensecode.config.selectEngine", () => {
      let engine = Configuration.engines;
      let ae = context.globalState.get<Engine>("engine");
      let qp = vscode.window.createQuickPick<Engine>();
      qp.placeholder = `${vscode.l10n.t("Select engine, current is [{0}]", ae ? ae.label : "None")}`;
      qp.items = engine;
      qp.onDidChangeSelection(async items => {
        if (items[0]) {
          activeEngine = items[0];
          await checkEngineKey();
          context.globalState.update("engine", activeEngine);
          updateStatusBarItem(context, statusBarItem);
          qp.hide();
        }
      });
      qp.show();
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("sensecode.clearKey", async () => {
      await context.secrets.delete("sensecode.key");
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("sensecode.settings", () => {
      return vscode.commands.executeCommand("workbench.action.openGlobalSettings", { query: "SenseCode" });
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("sensecode.inlineSuggest.trigger", async () => {
      await checkEngineKey();
      return vscode.commands.executeCommand("editor.action.inlineSuggest.trigger", vscode.window.activeTextEditor);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("sensecode.inlineSuggest.toggleAuto", () => {
      const configuration = vscode.workspace.getConfiguration("SenseCode", undefined);
      let autoComplete = configuration.get("CompletionAutomatically", true);
      configuration.update("CompletionAutomatically", !autoComplete, true).then(() => {
        Configuration.update();
        updateStatusBarItem(context, statusBarItem);
      }, (reason) => {
        vscode.window.showErrorMessage(reason);
      });
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("sensecode.inlineSuggest.togglePrintOut", () => {
      const configuration = vscode.workspace.getConfiguration("SenseCode", undefined);
      let printOut = configuration.get("DirectPrintOut", true);
      configuration.update("DirectPrintOut", !printOut, true).then(() => {
        Configuration.update();
        updateStatusBarItem(context, statusBarItem);
      }, (reason) => {
        vscode.window.showErrorMessage(reason);
      });
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("sensecode.inlineSuggest.setKeybinding", () => {
      return vscode.commands.executeCommand("workbench.action.openGlobalKeybindings", "sensecode.inlineSuggest.trigger");
    })
  );

  // create a new status bar item that we can now manage
  statusBarItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Right,
    100
  );
  statusBarItem.color = new vscode.ThemeColor("statusBar.remoteForeground");
  statusBarItem.backgroundColor = new vscode.ThemeColor("statusBar.remoteBackground");
  updateStatusBarItem(context, statusBarItem);

  let inlineProvider: vscode.InlineCompletionItemProvider;

  inlineProvider = inlineCompletionProvider(
    context,
    statusBarItem
  );

  showHideStatusBtn(vscode.window.activeTextEditor?.document, statusBarItem);

  context.subscriptions.push(
    vscode.languages.registerInlineCompletionItemProvider(
      { pattern: "**" },
      inlineProvider
    )
  );

  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor((editor) => {
      showHideStatusBtn(editor?.document, statusBarItem);
    })
  );

  const provider = new SenseCodeViewProvider(context);

  const view = vscode.window.registerWebviewViewProvider(
    "sensecode.view",
    provider,
    {
      webviewOptions: {
        retainContextWhenHidden: true,
      },
    }
  );
  context.subscriptions.push(view);

  const commands = [
    ["sensecode.addTests", "addTests"],
    ["sensecode.findProblems", "findProblems"],
    ["sensecode.optimize", "optimize"],
    ["sensecode.explain", "explain"]
  ];

  const registeredCommands = commands.map(([command, promptKey]) =>
    vscode.commands.registerCommand(command, async () => {
      await vscode.commands.executeCommand('sensecode.view.focus');
      await new Promise((f) => setTimeout(f, 1000));
      await checkEngineKey();
      let selection = undefined;
      let commandPrefix = Configuration.prompt[promptKey] as string;
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        return;
      }

      selection = editor.document.getText(editor.selection);
      provider?.sendApiRequest(commandPrefix, selection, getDocumentLanguage(editor.document));
    })
  );

  const customPromptCommand = vscode.commands.registerCommand("sensecode.customPrompt", async () => {
    await vscode.commands.executeCommand('sensecode.view.focus');
    await new Promise((f) => setTimeout(f, 1000));
    await checkEngineKey();
    let selection = undefined;
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      return;
    }
    selection = editor.document.getText(editor.selection);
    if (selection) {
      let prompts = Configuration.prompt;
      let p = undefined;
      for (let k in prompts) {
        p = prompts[k];
        break;
      }
      provider?.sendApiRequest(p, selection, getDocumentLanguage(editor.document), false);
    }
  });

  context.subscriptions.push(customPromptCommand, ...registeredCommands);

}
export function deactivate() { }
