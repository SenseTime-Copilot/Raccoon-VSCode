import { CustomReadonlyEditorProvider, ExtensionContext, CancellationToken, Uri, CustomDocument, CustomDocumentOpenContext, WebviewPanel } from 'vscode';
import { SenseCodeEditor } from './webviewProvider';

export class SenseCodeEidtorProvider implements CustomReadonlyEditorProvider {
  public static readonly viewType = "sensecode.editor";
  private static editors: { [key: string]: SenseCodeEditor } = {};
  private eidtor?: SenseCodeEditor;
  private id?: string;
  constructor(private context: ExtensionContext) {
  }

  public static getEditor(uri: Uri) {
    let id = uri.query;
    if (id) {
      return SenseCodeEidtorProvider.editors[id];
    }
  }

  openCustomDocument(uri: Uri, _openContext: CustomDocumentOpenContext, _token: CancellationToken): CustomDocument | Thenable<CustomDocument> {
    return {
      uri,
      dispose: () => {
        if (this.id) {
          delete SenseCodeEidtorProvider.editors[this.id];
        }
        if (this.eidtor) {
          this.eidtor.dispose();
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
      this.eidtor = new SenseCodeEditor(this.context, webviewPanel.webview);
      SenseCodeEidtorProvider.editors[id] = this.eidtor;
      webviewPanel.onDidDispose((_e) => {
        delete this.eidtor;
      });
    }
  }
}
