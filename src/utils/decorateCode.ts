import { window, workspace, Range, TextEditor, OverviewRulerLane, ThemeColor } from 'vscode';

export function decorateCodeWithSenseCodeLabel(editor: TextEditor, start: number, end: number) {
  if (start !== undefined && end !== undefined) {
    let insertDecorationType = window.createTextEditorDecorationType({
      backgroundColor: new ThemeColor("diffEditor.insertedLineBackground"),
      isWholeLine: true,
      overviewRulerColor: new ThemeColor("minimapGutter.addedBackground"),
      overviewRulerLane: OverviewRulerLane.Full,
      after: {
        contentText: "⁣⁣⁣⁣　SenseCode⁣⁣⁣⁣　",
        backgroundColor: new ThemeColor("activityBarBadge.background"),
        color: new ThemeColor("activityBarBadge.foreground"),
        borderColor: new ThemeColor("activityBar.activeBorder")
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
