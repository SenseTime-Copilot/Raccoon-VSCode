import { ExtensionContext, TextDocumentContentProvider, Uri, commands, workspace } from "vscode";
import { diffContentProviderScheme, extensionNameKebab } from "../globalEnv";

export default class DiffContentProvider implements TextDocumentContentProvider {
  static register(context: ExtensionContext) {
    context.subscriptions.push(
      workspace.registerTextDocumentContentProvider(diffContentProviderScheme, new DiffContentProvider())
    );
  }

  provideTextDocumentContent(uri: Uri): string {
    return uri.query;
  }
}

export function diffCode(language: string, text1: string, text2: string) {
  commands.executeCommand('vscode.diff',
    Uri.from({ scheme: diffContentProviderScheme, path: `origin.${language}`, query: text1 }),
    Uri.from({ scheme: diffContentProviderScheme, path: `${extensionNameKebab}.${language}`, query: text2 })
  );
}