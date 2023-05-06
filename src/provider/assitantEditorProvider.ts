import { CustomReadonlyEditorProvider, ExtensionContext, CancellationToken, Uri, CustomDocument, CustomDocumentOpenContext, WebviewPanel } from 'vscode';
import { SenseCodeEditor } from './webviewProvider';

export class SenseCodeEidtorProvider implements CustomReadonlyEditorProvider {
  public static readonly viewType = "sensecode.editor";
  private eidtor?: SenseCodeEditor;
  constructor(private context: ExtensionContext) {
  }

  openCustomDocument(uri: Uri, _openContext: CustomDocumentOpenContext, _token: CancellationToken): CustomDocument | Thenable<CustomDocument> {
    return { uri, dispose: () => { } };
  }

  public resolveCustomEditor(
    _document: CustomDocument, webviewPanel: WebviewPanel, _token: CancellationToken
  ) {
    this.eidtor = new SenseCodeEditor(this.context, webviewPanel.webview);
    webviewPanel.onDidDispose((_e) => {
      delete this.eidtor;
    });
  }
}
