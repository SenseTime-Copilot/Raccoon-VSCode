
import * as vscode from 'vscode';
import { configuration } from '../extension';
import { SenseCodeViewProvider } from './webviewProvider';
import { Prompt } from '../param/configures';

export class SenseCodeAction implements vscode.CodeActionProvider {
  public provideCodeActions(document: vscode.TextDocument, range: vscode.Range): vscode.CodeAction[] | undefined {
    if (range.isEmpty) {
      return;
    }
    let ps = configuration.prompt;
    let actions: vscode.CodeAction[] = [];
    for (let p of ps) {
      let custom = "";
      let ellip = "";
      if (p.prompt.includes('${input')) {
        ellip = "...";
      }
      if (p.type === "custom") {
        custom = " ✨ ";
      }
      let name = `SenseCode: ${custom}${p.label}${ellip}`;
      actions.push(new vscode.CodeAction(name, vscode.CodeActionKind.QuickFix.append('sensecode')));
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
    let selection = vscode.window.activeTextEditor?.selection;
    let document = vscode.window.activeTextEditor?.document;
    let ps = configuration.prompt;
    let label = codeAction.title.slice(11);
    let prompt: Prompt | undefined = undefined;
    /*
    if (codeAction.kind?.contains(vscode.CodeActionKind.QuickFix.append('sensecode.diagnostic'))) {

    }
    */
    for (let p of ps) {
      if (p.label === label) {
        prompt = p;
        break;
      }
      if ((" ✨ " + p.label) === label) {
        prompt = p;
        break;
      }
    }
    if (!prompt && codeAction.title.endsWith("...")) {
      label = codeAction.title.slice(11, -3);
      for (let p of ps) {
        if (p.label === label) {
          prompt = p;
          break;
        }
        if ((" ✨ " + p.label) === label) {
          prompt = p;
          break;
        }
      }
    }
    if (prompt && document && selection && !token.isCancellationRequested) {
      let code = document.getText(selection);
      SenseCodeViewProvider.ask(prompt, code, document.languageId);
    }
    return codeAction;
  }
}
