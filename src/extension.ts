import * as vscode from "vscode";
import { Configuration, Prompt } from "./param/configures";
import { checkPrivacy } from "./utils/checkPrivacy";
import { updateStatusBarItem } from "./utils/updateStatusBarItem";
import { getDocumentLanguage, inlineCompletionProvider, showHideStatusBtn } from "./provider/inlineCompletionProvider";
import { SenseCodeViewProvider } from "./provider/webviewProvider";

let statusBarItem: vscode.StatusBarItem;
export let outlog: vscode.LogOutputChannel;
export let configuration: Configuration;
export let telemetryReporter: vscode.TelemetryLogger;

export async function activate(context: vscode.ExtensionContext) {
  outlog = vscode.window.createOutputChannel(vscode.l10n.t("SenseCode"), { log: true });
  context.subscriptions.push(outlog);

  const sender: vscode.TelemetrySender = {
    flush() {
    },
    sendErrorData(_error, _data) {
    },
    sendEventData(eventName, data) {
      outlog.info(eventName, data);
    },
  };
  telemetryReporter = vscode.env.createTelemetryLogger(sender);

  configuration = new Configuration(context);
  configuration.update();

  checkPrivacy(context);

  context.subscriptions.push(
    vscode.commands.registerCommand("sensecode.setKey", async () => {
      await vscode.window.showInputBox({ title: `${vscode.l10n.t("SenseCode: Input your Key...")}`, password: true, ignoreFocusOut: true }).then(async (v) => {
        configuration.setApiKey(v);
      });
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("sensecode.clearKey", async () => {
      vscode.window.showWarningMessage(
        vscode.l10n.t("Clear API Key from your Secret Storage?"),
        { modal: true },
        vscode.l10n.t("Clear"))
        .then((v) => {
          if (v === vscode.l10n.t("Clear")) {
            configuration.setApiKey(undefined);
          }
        });
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("sensecode.settings", () => {
      return provider.updateSettingPage(true);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("sensecode.inlineSuggest.trigger", async () => {
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

  const customPromptCommand = vscode.commands.registerCommand("sensecode.customPrompt", async () => {
    await vscode.commands.executeCommand('sensecode.view.focus');
    await new Promise((f) => setTimeout(f, 1000));
    let selection = undefined;
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      return;
    }
    selection = editor.document.getText(editor.selection);
    if (selection) {
      let prompt: Prompt = {
        type: "code Q&A",
        prompt: `\${input:${vscode.l10n.t("Question Here...")}}`
      };
      provider?.sendApiRequest(prompt, selection, getDocumentLanguage(editor.document));
    }
  });

  context.subscriptions.push(customPromptCommand);

  showHideStatusBtn(vscode.window.activeTextEditor?.document, statusBarItem);
}
export function deactivate() { }
