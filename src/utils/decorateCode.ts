import { window, workspace, Range, TextEditor, OverviewRulerLane, ThemeColor } from 'vscode';
import { extensionDisplayName } from '../globalEnv';

export function decorateCodeWithRaccoonLabel(editor: TextEditor, start: number, end: number) {
  if (start !== undefined && end !== undefined) {
    let insertDecorationType = window.createTextEditorDecorationType({
      backgroundColor: new ThemeColor("diffEditor.insertedLineBackground"),
      isWholeLine: true,
      overviewRulerColor: new ThemeColor("minimapGutter.addedBackground"),
      overviewRulerLane: OverviewRulerLane.Full,
      after: {
        contentText: `⁣⁣⁣⁣　${extensionDisplayName}⁣　`,
        backgroundColor: new ThemeColor("button.background"),
        color: new ThemeColor("button.foreground"),
        border: "1px outset",
        borderColor: new ThemeColor("button.border")
      }
    });
    let remover = workspace.onDidChangeTextDocument((e) => {
      if (e.document.uri.path === editor.document.uri.path) {
        editor.setDecorations(insertDecorationType, []);
      }
    });
    editor.setDecorations(insertDecorationType, [{
      range: new Range(start, 0, end, 0)
    }]);
    setTimeout(() => {
      remover.dispose();
      editor.setDecorations(insertDecorationType, []);
    }, 5000);
  }
}
