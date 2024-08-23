import * as vscode from 'vscode';
import { extensionNameKebab, raccoonConfig, raccoonManager } from '../globalEnv';
import { getDocumentSymbols } from '../utils/collectionPromptInfo';

export class RaccoonCodelensProvider implements vscode.CodeLensProvider {
  private _onDidChangeCodeLenses: vscode.EventEmitter<void> = new vscode.EventEmitter<void>();
  public readonly onDidChangeCodeLenses: vscode.Event<void> = this._onDidChangeCodeLenses.event;

  constructor() {
    vscode.workspace.onDidChangeConfiguration((_) => {
      this._onDidChangeCodeLenses.fire();
    });
  }

  public provideCodeLenses(document: vscode.TextDocument, _token: vscode.CancellationToken): vscode.CodeLens[] | Thenable<vscode.CodeLens[]> {
    if (raccoonManager.codelens) {
      return getDocumentSymbols(document.uri).then(symbols => {
        let codeLenses: vscode.CodeLens[] = [];
        gatherSymbol(symbols, codeLenses);
        return codeLenses;
      });
    }
    return [];

    function gatherSymbol(symbols: vscode.DocumentSymbol[], codeLenses: vscode.CodeLens[]) {
      for (let s of symbols) {
        if ([vscode.SymbolKind.Class, vscode.SymbolKind.Constructor, vscode.SymbolKind.Enum, vscode.SymbolKind.Function, vscode.SymbolKind.Interface, vscode.SymbolKind.Method, vscode.SymbolKind.Struct, vscode.SymbolKind.Object, vscode.SymbolKind.Module, vscode.SymbolKind.Namespace].includes(s.kind)) {
          codeLenses.push(
            new vscode.CodeLens(
              s.range,
              {
                title: `$(${extensionNameKebab}-icon)`,
                command: ""
              }
            )
          );
          for (let p of raccoonConfig.builtinPrompt()) {
            codeLenses.push(new vscode.CodeLens(
              s.range,
              {
                title: `${p.label}`,
                command: `${extensionNameKebab}.HintsAction`,
                arguments: [s.range]
              }
            ));
          }
          gatherSymbol(s.children, codeLenses);
        }
      }
    }
  }

  public resolveCodeLens(codeLens: vscode.CodeLens, _token: vscode.CancellationToken) {
    if (raccoonManager.codelens) {
      return codeLens;
    }
    return null;
  }
}
