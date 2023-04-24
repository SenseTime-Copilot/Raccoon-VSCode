
import * as vscode from 'vscode';
import { configuration, provider } from '../extension';

export class SenseCodeAction implements vscode.CodeActionProvider {
  public provideCodeActions(document: vscode.TextDocument, range: vscode.Range): vscode.CodeAction[] | undefined {
    if (range.isEmpty) {
      return;
    }
    let ps = configuration.prompt;
    let actions: vscode.CodeAction[] = [];
    for (let p of ps) {
      let ellip = "";
      if (p.prompt.includes('${input')) {
        ellip = "...";
      }
      actions.push(new vscode.CodeAction("SenseCode: " + p.label + ellip, vscode.CodeActionKind.QuickFix.append('sensecode')));
    }
    return actions;
  }

  public resolveCodeAction(codeAction: vscode.CodeAction, token: vscode.CancellationToken): vscode.ProviderResult<vscode.CodeAction> {
    let selection = vscode.window.activeTextEditor?.selection;
    let document = vscode.window.activeTextEditor?.document;
    let ps = configuration.prompt;
    let label = codeAction.title.slice(11);
    let prompt = undefined;
    for (let p of ps) {
      if (p.label === label) {
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
      }
    }
    if (prompt && document && selection && !token.isCancellationRequested) {
      let code = document.getText(selection);
      provider.sendApiRequest(prompt, code, document.languageId);
    }
    return codeAction;
  }
}
