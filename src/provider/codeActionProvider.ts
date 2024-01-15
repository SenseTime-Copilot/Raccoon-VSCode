
import * as vscode from 'vscode';
import { raccoonEditorProviderViewType, extensionNameKebab, raccoonManager, registerCommand, extensionDisplayName } from "../globalEnv";
import { RaccoonEditor, RaccoonViewProvider } from './webviewProvider';
import { PromptInfo, PromptType, RaccoonPrompt } from "./promptTemplates";
import { RaccoonEditorProvider } from './assitantEditorProvider';
import { Role } from '../raccoonClient/src/CodeClient';

export class RaccoonAction implements vscode.CodeActionProvider {
  constructor(context: vscode.ExtensionContext) {
    registerCommand(context, 'codeaction', (prompt) => {
      let editor: RaccoonEditor | undefined = this.getEditor();
      if (editor) {
        if (prompt) {
          editor.sendApiRequest(new PromptInfo(prompt));
        } else {
          editor.sendMessage({ type: 'focus' });
        }
      } else {
        RaccoonViewProvider.ask(prompt && new PromptInfo(prompt));
      }
    });
  }

  public provideCodeActions(document: vscode.TextDocument, range: vscode.Range): vscode.CodeAction[] | undefined {
    let ps = raccoonManager.prompt;
    let actions: vscode.CodeAction[] = [];
    if (!range.isEmpty) {
      for (let p of ps) {
        if (p.type === PromptType.help) {
          continue;
        }
        let kind = vscode.CodeActionKind.QuickFix.append(extensionNameKebab);
        let name = `${extensionDisplayName}: `;
        if (p.type === PromptType.customPrompt) {
          if (p.message.content.includes("{{code}}")) {
            kind = kind.append("custom");
            name += " ✨ ";
          } else {
            continue;
          }
        } else {
          kind = kind.append("builtin");
        }
        name += p.label;
        if (p.inputRequired) {
          name += "...";
        }
        actions.push(new vscode.CodeAction(name, kind));
      }
      actions.push(
        new vscode.CodeAction(
          `${extensionDisplayName}: ${vscode.l10n.t("Ask Raccoon")}...`,
          vscode.CodeActionKind.QuickFix.append(extensionNameKebab).append("preset")
        )
      );
    }
    let diagnostics = vscode.languages.getDiagnostics(document.uri);
    for (let diagnostic of diagnostics) {
      if ((diagnostic.severity === vscode.DiagnosticSeverity.Error || diagnostic.severity === vscode.DiagnosticSeverity.Warning) && range.intersection(diagnostic.range)) {
        let a = new vscode.CodeAction(`${extensionDisplayName}: ${vscode.l10n.t("Code Correction")}: ${diagnostic.message}`, vscode.CodeActionKind.QuickFix.append(`${extensionNameKebab}.diagnostic`));
        a.diagnostics = [diagnostic];
        actions.push(a);
      }
    }
    return actions;
  }

  public resolveCodeAction(codeAction: vscode.CodeAction, token: vscode.CancellationToken): vscode.ProviderResult<vscode.CodeAction> {
    if (!codeAction.kind) {
      return codeAction;
    }
    if (vscode.CodeActionKind.QuickFix.append(extensionNameKebab).append('preset').contains(codeAction.kind)) {
      if (codeAction.title === `${extensionDisplayName}: ${vscode.l10n.t("Ask Raccoon")}...`) {
        codeAction.command = {
          command: `${extensionNameKebab}.codeaction`,
          title: codeAction.title
        };
        return codeAction;
      }
    }

    let selection = vscode.window.activeTextEditor?.selection;
    let document = vscode.window.activeTextEditor?.document;

    if (selection && vscode.CodeActionKind.QuickFix.append(extensionNameKebab).append('diagnostic').contains(codeAction.kind)) {
      let diagnosticPrompt: RaccoonPrompt = {
        label: vscode.l10n.t("Code Correction"),
        type: PromptType.codeErrorCorrection,
        languageid: document?.languageId,
        code: document?.getText(selection) || document?.lineAt(selection.anchor.line).text,
        message: {
          role: Role.user,
          content: `${vscode.l10n.t("Fix any problem in the following code")}, ${codeAction.diagnostics![0].message}\n{{code}}`
        }
      };
      codeAction.command = {
        command: `${extensionNameKebab}.codeaction`,
        arguments: [diagnosticPrompt],
        title: codeAction.title
      };
      return codeAction;
    }

    let ps = raccoonManager.prompt;
    let label = codeAction.title.slice(`${extensionDisplayName}: `.length);
    let prompt: RaccoonPrompt | undefined = undefined;
    let prefix = '';
    if (vscode.CodeActionKind.QuickFix.append(extensionNameKebab).append('custom').contains(codeAction.kind)) {
      prefix = ' ✨ ';
    }

    for (let p of ps) {
      let match = (prefix + p.label) === label;
      if (p.inputRequired) {
        match = (prefix + p.label + "...") === label;
      }
      if (match) {
        prompt = { ...p };
        break;
      }
    }
    if (prompt && document && selection && !token.isCancellationRequested) {
      prompt.code = document.getText(selection);
      if (document.languageId !== "plaintext") {
        prompt.languageid = document.languageId;
      }

      codeAction.command = {
        command: `${extensionNameKebab}.codeaction`,
        arguments: [prompt],
        title: codeAction.title
      };
    }

    return codeAction;
  }

  private getEditor(): RaccoonEditor | undefined {
    let editor: RaccoonEditor | undefined = undefined;
    let allTabGroups = vscode.window.tabGroups.all;
    for (let tg of allTabGroups) {
      for (let tab of tg.tabs) {
        if (tab.isActive && tab.input instanceof vscode.TabInputCustom && tab.input.viewType === raccoonEditorProviderViewType) {
          if (editor === undefined || tab.group.isActive) {
            editor = RaccoonEditorProvider.getEditor(tab.input.uri);
          }
        }
      }
    }
    return editor;
  }
}
