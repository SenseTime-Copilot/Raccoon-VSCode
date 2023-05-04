import * as vscode from "vscode";

import { parseMarkdown, writeCellsToMarkdown } from './markdownParser';

class SenseCodeNotebookSerializer implements vscode.NotebookSerializer {
  deserializeNotebook(data: Uint8Array): vscode.NotebookData {
    let content = Buffer.from(data).toString('utf8');
    return parseMarkdown(content);
  }

  serializeNotebook(data: vscode.NotebookData): Uint8Array {
    const stringOutput = writeCellsToMarkdown(data);
    return Buffer.from(stringOutput);
  }
}

export class SenseCodeNotebook {
  public static readonly notebookType = 'sensecode.correction';
  static rigister(context: vscode.ExtensionContext) {
    context.subscriptions.push(vscode.workspace.registerNotebookSerializer(SenseCodeNotebook.notebookType, new SenseCodeNotebookSerializer(), { transientOutputs: true }));
  }

  static open(data: any) {
    let cells = parseMarkdown(Buffer.from(data).toString('utf8'));
    vscode.workspace.openNotebookDocument(SenseCodeNotebook.notebookType, cells).then(nb => {
      vscode.window.showNotebookDocument(nb);
    });
  }
}
