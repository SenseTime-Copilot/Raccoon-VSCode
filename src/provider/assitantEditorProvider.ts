import { CustomReadonlyEditorProvider, ExtensionContext, CancellationToken, Uri, CustomDocument, CustomDocumentOpenContext, WebviewPanel, commands } from 'vscode';
import { SenseCodeEditor } from './webviewProvider';

export class SenseCodeEditorProvider implements CustomReadonlyEditorProvider {
  public static readonly viewType = "sensecode.editor";
  private static editors: { [key: string]: SenseCodeEditor } = {};
  private editor?: SenseCodeEditor;
  private id?: string;
  constructor(private context: ExtensionContext) {
  }

  public static getEditor(uri: Uri) {
    let id = uri.query;
    if (id) {
      return SenseCodeEditorProvider.editors[id];
    }
  }

  openCustomDocument(uri: Uri, _openContext: CustomDocumentOpenContext, _token: CancellationToken): CustomDocument | Thenable<CustomDocument> {
    return {
      uri,
      dispose: () => {
        if (this.id) {
          delete SenseCodeEditorProvider.editors[this.id];
        }
        if (this.editor) {
          this.editor.dispose();
        }
      }
    };
  }

  public resolveCustomEditor(
    document: CustomDocument, webviewPanel: WebviewPanel, _token: CancellationToken
  ) {
    let id = document.uri.query;
    if (id) {
      this.id = id;
      this.editor = new SenseCodeEditor(this.context, webviewPanel.webview, `sensecode-${id}.json`);
      commands.executeCommand('workbench.action.pinEditor', document.uri);
      SenseCodeEditorProvider.editors[id] = this.editor;
    }
  }
}
