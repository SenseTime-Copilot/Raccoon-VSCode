import * as vscode from "vscode";
import { Configuration, Engine } from "./param/configures";
import { checkPrivacy } from "./utils/checkPrivacy";
import { updateStatusBarItem } from "./utils/updateStatusBarItem";
import { getDocumentLanguage, inlineCompletionProvider, showHideStatusBtn } from "./provider/inlineCompletionProvider";
import { SenseCodeViewProvider } from "./provider/webviewProvider";

let statusBarItem: vscode.StatusBarItem;
export let outlog: vscode.LogOutputChannel;
export let configuration: Configuration;

export async function activate(context: vscode.ExtensionContext) {
  configuration = new Configuration(context);
  outlog = vscode.window.createOutputChannel("SenseCode", { log: true });
  context.subscriptions.push(outlog);
  vscode.commands.executeCommand("setContext", "sensecode.next.chat", configuration.next.chat === true);

  checkPrivacy(context);

  async function checkEngineKey(ae?: Engine) {
    if (!ae) {
      return;
    }
    if (ae.key === undefined) {
      let k = await context.secrets.get("sensecode.key");
      if (k) {
        ae.key = k;
      } else {
        return vscode.window.showInputBox({ title: `${vscode.l10n.t("SenseCode: Input your Key...")}`, ignoreFocusOut: true }).then(async (v) => {
          if (v) {
            await context.secrets.store("sensecode.key", v);
            ae!.key = v;
          }
        });
      }
    }
  }

  context.subscriptions.push(
    vscode.commands.registerCommand("sensecode.clearKey", async () => {
      await context.secrets.delete("sensecode.key");
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("sensecode.settings", () => {
      return provider.updateSettingPage(true);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("sensecode.inlineSuggest.trigger", async () => {
      let ae = configuration.activeEngine;
      await checkEngineKey(ae);
      return vscode.commands.executeCommand("editor.action.inlineSuggest.trigger", vscode.window.activeTextEditor);
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
      let ae = configuration.activeEngine;
      await checkEngineKey(ae);
      let selection = undefined;
      let commandPrefix = configuration.prompt[promptKey] as string;
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
    let ae = configuration.activeEngine;
    await checkEngineKey(ae);
    let selection = undefined;
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      return;
    }
    selection = editor.document.getText(editor.selection);
    if (selection) {
      let prompts = configuration.prompt;
      let p = undefined;
      for (let k in prompts) {
        p = prompts[k];
        break;
      }
      provider?.sendApiRequest(p, selection, getDocumentLanguage(editor.document), false);
    }
  });

  context.subscriptions.push(customPromptCommand, ...registeredCommands);

  showHideStatusBtn(vscode.window.activeTextEditor?.document, statusBarItem);

}
export function deactivate() { }
