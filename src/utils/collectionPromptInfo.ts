import { TextDocument, Range, commands, LocationLink, Location, SemanticTokens, Position, ExtensionContext, window, workspace } from "vscode";
import { registerCommand } from "../globalEnv";

interface CollectionInfo {
  declarations: LocationLink[];
  definitions: LocationLink[];
  implementations: Location[];
  references: Location[];
  typeDefinitions: Location[];
}

async function collectionPromptInfo(doc: TextDocument, position: Position) {
  let out: CollectionInfo = {
    declarations: [],
    definitions: [],
    implementations: [],
    references: [],
    typeDefinitions: []
  };

  return commands.executeCommand("vscode.provideDocumentSemanticTokens", doc.uri).then(async (result) => {
    let tokens = result as SemanticTokens;
    if (!tokens || !tokens.data) {
      return out;
    }
    let len = Math.floor(tokens.data.length / 5);
    let p = new Position(0, 0);
    for (let idx = 0; idx < len; idx++) {
      let pos = idx * 5;
      let deltaLine = tokens.data[pos];
      let startChar = tokens.data[pos + 1];
      let length = tokens.data[pos + 2];
      let tokenType = tokens.data[pos + 3];
      let tokenModifiers = tokens.data[pos + 4];
      if (deltaLine !== 0) {
        p = p.with(undefined, 0);
      }
      let range = new Range(p.translate(deltaLine, startChar), p.translate(deltaLine, startChar + length));
      p = p.translate(deltaLine, startChar);
      if (!range.contains(position)) {
        continue;
      }
      let p1 = commands.executeCommand("vscode.executeDefinitionProvider", doc.uri, p).then((def) => {
        let defs = def as LocationLink[];
        out.definitions.push(...defs);
      });
      let p2 = commands.executeCommand("vscode.executeTypeDefinitionProvider", doc.uri, p).then((tdef) => {
        let tdefs = tdef as Location[];
        out.typeDefinitions.push(...tdefs);
      });
      let p3 = commands.executeCommand("vscode.executeDeclarationProvider", doc.uri, p).then((dec) => {
        let decs = dec as LocationLink[];
        out.declarations.push(...decs);
      });
      let p4 = commands.executeCommand("vscode.executeImplementationProvider", doc.uri, p).then((imp) => {
        let imps = imp as Location[];
        out.implementations.push(...imps);
      });
      let p5 = commands.executeCommand("vscode.executeReferenceProvider", doc.uri, p).then((ref) => {
        let refs = ref as Location[];
        out.references.push(...refs);
      });
      return Promise.all([p1, p2, p3, p4, p5])
        .then(() => {
          return out;
        });
    }
  });
}

export function registerInfoCollector(context: ExtensionContext) {
  registerCommand(context, "collectInfo", () => {
    let editor = window.activeTextEditor;
    if (editor) {
      collectionPromptInfo(editor.document, editor.selection.anchor).then(async v => {
        if (!v) {
          return;
        }
        let n = { declarations: [] as string[], definitions: [] as string[], implementations: [] as string[], references: [] as string[], typeDefinitions: [] as string[] };
        for (let a of v.declarations) {
          await workspace.openTextDocument(a.targetUri).then(doc => {
            n.declarations.push(doc.getText(a.targetRange));
          });
        }
        for (let b of v.definitions) {
          await workspace.openTextDocument(b.targetUri).then(doc => {
            n.definitions.push(doc.getText(b.targetRange));
          });
        }
        for (let c of v.implementations) {
          await workspace.openTextDocument(c.uri).then(doc => {
            let line = doc.lineAt(c.range.start.line);
            n.implementations.push(line.text);
          });
        }
        for (let d of v.references) {
          await workspace.openTextDocument(d.uri).then(doc => {
            let line = doc.lineAt(d.range.start.line);
            n.references.push(line.text);
          });
        }
        for (let e of v.typeDefinitions) {
          await workspace.openTextDocument(e.uri).then(doc => {
            let line = doc.lineAt(e.range.start.line);
            n.typeDefinitions.push(line.text);
          });
        }
        console.log(JSON.stringify(n, undefined, 2));
      });
    }
  });
}