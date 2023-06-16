
import * as vscode from 'vscode';
import { sensecodeManager } from '../extension';
import { SenseCodeViewProvider } from './webviewProvider';
import { Prompt } from './sensecodeManager';

export class SenseCodeAction implements vscode.CodeActionProvider {
  public provideCodeActions(document: vscode.TextDocument, range: vscode.Range): vscode.CodeAction[] | undefined {
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
      if (p.type === "custom") {
        kind = kind.append("custom");
        name += " ✨ ";
      } else {
        kind = kind.append("builtin");
      }
      name += p.label;
      if (p.prompt.includes('${input')) {
        name += "...";
        kind = kind.append("edit");
      } else {
        kind = kind.append("send");
      }
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
        let focusAction = {
          type: "focus",
          label: "Ask SenseCode...",
          prompt: ""
        };
        SenseCodeViewProvider.ask(focusAction, "", "");
      }
      return codeAction;
    }

    let selection = vscode.window.activeTextEditor?.selection;
    let document = vscode.window.activeTextEditor?.document;
    let ps = sensecodeManager.prompt;
    let label = codeAction.title.slice(11);
    let prompt: Prompt | undefined = undefined;
    let prefix = '';
    let suffix = '';
    if (vscode.CodeActionKind.QuickFix.append('sensecode').append('custom').contains(codeAction.kind)) {
      prefix = ' ✨ ';
      if (vscode.CodeActionKind.QuickFix.append('sensecode').append('custom').append('edit').contains(codeAction.kind)) {
        suffix = '...';
      }
    } else if (vscode.CodeActionKind.QuickFix.append('sensecode').append('builtin').append('edit').contains(codeAction.kind)) {
      suffix = '...';
    }

    for (let p of ps) {
      if ((prefix + p.label + suffix) === label) {
        prompt = p;
        break;
      }
    }
    if (prompt && document && selection && !token.isCancellationRequested) {
      let code = document.getText(selection);
      let lang = '';
      if (document.languageId !== "plaintext") {
        lang = document.languageId;
      }
      SenseCodeViewProvider.ask(prompt, code, lang);
    }
    return codeAction;
  }
}
