import { CustomReadonlyEditorProvider, ExtensionContext, CancellationToken, Uri, CustomDocument, CustomDocumentOpenContext, WebviewPanel, commands } from 'vscode';
import { RaccoonEditor } from './webviewProvider';

export class RaccoonEditorProvider implements CustomReadonlyEditorProvider {
  public static readonly viewType = "raccoon.editor";
  private static editors: { [key: string]: RaccoonEditor } = {};
  private editor?: RaccoonEditor;
  private id?: string;
  constructor(private context: ExtensionContext) {
  }

  public static getEditor(uri: Uri) {
    let id = uri.query;
    if (id) {
      return RaccoonEditorProvider.editors[id];
    }
  }

  openCustomDocument(uri: Uri, _openContext: CustomDocumentOpenContext, _token: CancellationToken): CustomDocument | Thenable<CustomDocument> {
    return {
      uri,
      dispose: () => {
        if (this.id) {
          delete RaccoonEditorProvider.editors[this.id];
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
      this.editor = new RaccoonEditor(this.context, webviewPanel.webview);
      commands.executeCommand('workbench.action.pinEditor', document.uri);
      RaccoonEditorProvider.editors[id] = this.editor;
    }
  }
}
