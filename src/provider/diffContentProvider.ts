import { ExtensionContext, TextDocumentContentProvider, Uri, commands, workspace } from "vscode";

export default class DiffContentProvider implements TextDocumentContentProvider {
  public static readonly scheme: string = "RaccoonDiff";

  static register(context: ExtensionContext) {
    context.subscriptions.push(
      workspace.registerTextDocumentContentProvider(DiffContentProvider.scheme, new DiffContentProvider())
    );
  }

  provideTextDocumentContent(uri: Uri): string {
    return uri.query;
  }
}

export function diffCode(language: string, text1: string, text2: string) {
  commands.executeCommand('vscode.diff',
    Uri.from({ scheme: DiffContentProvider.scheme, path: `origin.${language}`, query: text1 }),
    Uri.from({ scheme: DiffContentProvider.scheme, path: `raccoon.${language}`, query: text2 })
  );
}