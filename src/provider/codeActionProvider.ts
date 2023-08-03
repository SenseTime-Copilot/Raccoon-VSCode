
import * as vscode from 'vscode';
import { sensecodeManager } from '../extension';
import { SenseCodeEditor, SenseCodeViewProvider } from './webviewProvider';
import { PromptInfo, PromptType, SenseCodePrompt } from "./promptTemplates";
import { SenseCodeEditorProvider } from './assitantEditorProvider';

export class SenseCodeAction implements vscode.CodeActionProvider {
  public provideCodeActions(_document: vscode.TextDocument, range: vscode.Range): vscode.CodeAction[] | undefined {
    if (range.isEmpty) {
      return;
    }
    let ps = sensecodeManager.prompt;
    let actions: vscode.CodeAction[] = [
      new vscode.CodeAction(
        `SenseCode: ${vscode.l10n.t("Ask SenseCode")}...`,
        vscode.CodeActionKind.QuickFix.append('sensecode').append("preset")
      )
    ];
    for (let p of ps) {
      let kind = vscode.CodeActionKind.QuickFix.append('sensecode');
      let name = `SenseCode: `;
      if (p.type === PromptType.customPrompt) {
        if (p.message.content.includes("{code}")) {
          kind = kind.append("custom");
          name += " ✨ ";
        } else {
          continue;
        }
      } else {
        kind = kind.append("builtin");
      }
      name += p.label;
      actions.push(new vscode.CodeAction(name, kind));
    }
    /*
    let diagnostics = vscode.languages.getDiagnostics(document.uri);
    for (let diagnostic of diagnostics) {
      if ((diagnostic.severity === vscode.DiagnosticSeverity.Error || diagnostic.severity === vscode.DiagnosticSeverity.Warning) && range.intersection(diagnostic.range)) {
        let a = new vscode.CodeAction(`SenseCode: Help to ${diagnostic.message}`, vscode.CodeActionKind.QuickFix.append('sensecode.diagnostic'));
        a.diagnostics = [diagnostic];
        actions.push(a);
      }
    }
    */
    return actions;
  }

  public resolveCodeAction(codeAction: vscode.CodeAction, token: vscode.CancellationToken): vscode.ProviderResult<vscode.CodeAction> {
    if (!codeAction.kind) {
      return codeAction;
    }
    if (vscode.CodeActionKind.QuickFix.append('sensecode').append('preset').contains(codeAction.kind)) {
      if (codeAction.title === `SenseCode: ${vscode.l10n.t("Ask SenseCode")}...`) {
        let editor: SenseCodeEditor | undefined = this.getEditor();
        if (editor) {
          editor.sendMessage({ type: 'focus' });
        } else {
          SenseCodeViewProvider.ask();
        }
      }
      return codeAction;
    }

    let selection = vscode.window.activeTextEditor?.selection;
    let document = vscode.window.activeTextEditor?.document;
    let ps = sensecodeManager.prompt;
    let label = codeAction.title.slice(11);
    let prompt: SenseCodePrompt | undefined = undefined;
    let prefix = '';
    if (vscode.CodeActionKind.QuickFix.append('sensecode').append('custom').contains(codeAction.kind)) {
      prefix = ' ✨ ';
    }

    for (let p of ps) {
      if ((prefix + p.label) === label) {
        prompt = { ...p };
        break;
      }
    }
    if (prompt && document && selection && !token.isCancellationRequested) {
      prompt.code = document.getText(selection);
      if (document.languageId !== "plaintext") {
        prompt.languageid = document.languageId;
      }
      let editor: SenseCodeEditor | undefined = this.getEditor();
      if (editor) {
        editor.sendApiRequest(new PromptInfo(prompt));
      } else {
        SenseCodeViewProvider.ask(new PromptInfo(prompt));
      }
    }
    return codeAction;
  }

  private getEditor(): SenseCodeEditor | undefined {
    let editor: SenseCodeEditor | undefined = undefined;
    let allTabGroups = vscode.window.tabGroups.all;
    for (let tg of allTabGroups) {
      for (let tab of tg.tabs) {
        if (tab.isActive && tab.input instanceof vscode.TabInputCustom && tab.input.viewType === SenseCodeEditorProvider.viewType) {
          if (editor === undefined || tab.group.isActive) {
            editor = SenseCodeEditorProvider.getEditor(tab.input.uri);
          }
        }
      }
    }
    return editor;
  }
}
