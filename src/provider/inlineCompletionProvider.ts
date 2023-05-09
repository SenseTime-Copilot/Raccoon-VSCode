import * as vscode from "vscode";
import { Engine } from "../param/configures";
import { Trie } from "./trie";
import { GetCodeCompletions, getCodeCompletions } from "../utils/getCodeCompletions";
import { updateStatusBarItem } from "../utils/updateStatusBarItem";
import { IncomingMessage } from "http";
import { configuration, outlog } from "../extension";
import { getDocumentLanguage } from "../utils/getDocumentLanguage";

let lastRequest = null;
let trie = new Trie([]);

export function showHideStatusBtn(doc: vscode.TextDocument | undefined, statusBarItem: vscode.StatusBarItem) {
  let lang = "";
  if (doc) {
    lang = getDocumentLanguage(doc.languageId);
  }
  if (lang === "") {
    statusBarItem.hide();
  } else {
    statusBarItem.show();
  }
}

function middleOfLineWontComplete(cursorPosition: vscode.Position, document: any) {
  let currentLine = document?.lineAt(cursorPosition.line);
  let lineEndPosition = currentLine?.range.end;
  let selectionTrailingString: vscode.Selection;

  selectionTrailingString = new vscode.Selection(
    cursorPosition.line,
    cursorPosition.character,
    cursorPosition.line,
    lineEndPosition.character + 1
  );
  let trailingString = document.getText(selectionTrailingString);
  var re = /^[\]\{\}\); \n\r\t\'\"]*$/;
  if (re.test(trailingString)) {
    return false;
  } else {
    return true;
  }
}

function isAtTheMiddleOfLine(cursorPosition: vscode.Position, document: any) {
  let currentLine = document?.lineAt(cursorPosition.line);
  let lineEndPosition = currentLine?.range.end;
  let selectionTrailingString: vscode.Selection;

  selectionTrailingString = new vscode.Selection(
    cursorPosition.line,
    cursorPosition.character,
    cursorPosition.line,
    lineEndPosition.character + 1
  );
  let trailingString = document.getText(selectionTrailingString);
  let trimmed = trailingString.trim();
  return trimmed.length !== 0;
}

function removeTrailingCharsByReplacement(
  completion: string,
  replacement: string
) {
  for (let ch of replacement) {
    if (!isBracketBalanced(completion, ch)) {
      completion = replaceLast(completion, ch, "");
    }
  }
  return completion;
}

function replaceLast(str: string, toReplace: string, replacement: string) {
  let pos = str.lastIndexOf(toReplace);
  if (pos > -1) {
    return (
      str.substring(0, pos) +
      replacement +
      str.substring(pos + toReplace.length)
    );
  } else {
    return str;
  }
}

function isBracketBalanced(str: string, character: string) {
  let count = 0;
  for (let ch of str) {
    if (ch === character) {
      count++;
    }
    if (
      (character === "{" && ch === "}") ||
      (character === "[" && ch === "]") ||
      (character === "(" && ch === ")") ||
      (character === "}" && ch === "{") ||
      (character === "]" && ch === "[") ||
      (character === ")" && ch === "(")
    ) {
      count--;
    }
  }
  return count === 0;
}

export function inlineCompletionProvider(
  extension: vscode.ExtensionContext,
  statusBarItem: vscode.StatusBarItem
) {
  const provider: vscode.InlineCompletionItemProvider = {
    provideInlineCompletionItems: async (
      document,
      position,
      context,
      cancel
    ) => {
      const controller = new AbortController();
      cancel.onCancellationRequested(_e => {
        controller.abort();
        updateStatusBarItem(
          statusBarItem,
          {
            text: "$(circle-slash)",
            tooltip: vscode.l10n.t("User cancelled")
          }
        );
      });
      let editor = vscode.window.activeTextEditor;
      if (!editor) {
        return;
      }
      if (context.triggerKind === vscode.InlineCompletionTriggerKind.Automatic && !configuration.autoComplete) {
        return;
      }
      if (context.triggerKind === vscode.InlineCompletionTriggerKind.Automatic) {
        await new Promise((f) => setTimeout(f, (configuration.delay - 1) * 1000));
        if (!cancel.isCancellationRequested) {
          vscode.commands.executeCommand("editor.action.inlineSuggest.trigger", vscode.window.activeTextEditor);
        }
        return;
      }

      showHideStatusBtn(document, statusBarItem);
      let selection: vscode.Selection = editor.selection;
      if (!editor.selection.isEmpty) {
        vscode.commands.executeCommand("editor.action.codeAction", { kind: vscode.CodeActionKind.QuickFix.append("sensecode").value });
        return;
      } else {
        selection = new vscode.Selection(
          0,
          0,
          position.line,
          position.character
        );
      }
      let textBeforeCursor = document.getText(selection);
      if (
        position.character === 0 &&
        textBeforeCursor[textBeforeCursor.length - 1] !== "\n"
      ) {
        textBeforeCursor += "\n";
      }
      if (vscode.window.activeNotebookEditor) {
        const cells =
          vscode.window.activeNotebookEditor.notebook.getCells();
        const currentCell =
          vscode.window.activeNotebookEditor.selection.start;
        let str = "";
        for (let i = 0; i < currentCell; i++) {
          str += cells[i].document.getText().trimEnd() + "\n";
        }
        textBeforeCursor = str + textBeforeCursor;
      }
      if (textBeforeCursor.trim() === "") {
        updateStatusBarItem(statusBarItem);
        return;
      }

      if (middleOfLineWontComplete(position, document)) {
        updateStatusBarItem(statusBarItem);
        return;
      }

      if (textBeforeCursor.length > 8 || context.triggerKind === vscode.InlineCompletionTriggerKind.Invoke) {
        let requestId = new Date().getTime();
        lastRequest = requestId;
        if (lastRequest !== requestId) {
          return;
        }
        let rs: GetCodeCompletions | any;
        try {
          let activeEngine: Engine | undefined = configuration.activeEngine;
          if (!activeEngine) {
            vscode.window.showErrorMessage(vscode.l10n.t("Active engine not set"), vscode.l10n.t("Close"));
            throw Error(vscode.l10n.t("Active engine not set"));
          }
          updateStatusBarItem(
            statusBarItem,
            {
              text: "$(loading~spin)",
              tooltip: vscode.l10n.t("Thinking..."),
              keep: true
            }
          );
          // TODO: AST parse to ensure truncate at appropriate postion
          let maxTokens = activeEngine.config.max_tokens || 1024;
          if (textBeforeCursor.length > (maxTokens * 4)) {
            textBeforeCursor = textBeforeCursor.slice(-4 * maxTokens);
          }
          let engine = { ...activeEngine };
          engine.config = { ...activeEngine.config };
          if (configuration.completeLine) {
            engine.config.max_tokens = 32;
          }
          let prefix = `${vscode.l10n.t("Complete following {lang} code:\n", { lang: getDocumentLanguage(document.languageId) })}`;
          let suffix = ``;
          prefix = `Below is an instruction that describes a task. Write a response that appropriately completes the request.

### Instruction:
Task type: code completion. Please complete the following code, just response code only.

### Input:
`;
          suffix = `### Response:
`;
          rs = await getCodeCompletions(engine,
            `${prefix}\n${textBeforeCursor}\n${suffix}`,
            configuration.candidates,
            false, controller.signal);
        } catch (err: any) {
          if (err.message === "canceled") {
            return;
          }
          let errInfo = err.message || err.response?.data?.error;
          outlog.error(errInfo);
          if (!cancel.isCancellationRequested) {
            updateStatusBarItem(
              statusBarItem,
              {
                text: `$(alert)${err.response?.status || ""}`,
                tooltip: new vscode.MarkdownString(errInfo)
              }
            );
          } else {
            updateStatusBarItem(statusBarItem);
          }
          return;
        }
        if (cancel.isCancellationRequested) {
          updateStatusBarItem(
            statusBarItem,
            {
              text: "$(circle-slash)",
              tooltip: vscode.l10n.t("User cancelled")
            }
          );
          return;
        }
        if (rs === null) {
          updateStatusBarItem(
            statusBarItem,
            {
              text: "$(bracket)",
              tooltip: vscode.l10n.t("No completion suggestion")
            }
          );
          return;
        }

        if (rs instanceof IncomingMessage) {

        } else {
          let data = rs as GetCodeCompletions;
          // Add the generated code to the inline suggestion list
          let items = new Array<vscode.InlineCompletionItem>();
          let ts = new Date().valueOf();
          for (let i = 0; i < data.completions.length; i++) {
            let completion = data.completions[i];
            outlog.debug(completion);
            if (isAtTheMiddleOfLine(position, document)) {
              let currentLine = document?.lineAt(position.line);
              let lineEndPosition = currentLine?.range.end;
              let selectionTrailingString: vscode.Selection;

              selectionTrailingString = new vscode.Selection(
                position.line,
                position.character,
                position.line,
                lineEndPosition.character + 1
              );
              let trailingString = document.getText(
                selectionTrailingString
              );
              completion = removeTrailingCharsByReplacement(
                completion,
                trailingString
              );
              if (
                completion.trimEnd().slice(-1) === "{" ||
                completion.trimEnd().slice(-1) === ";" ||
                completion.trimEnd().slice(-1) === ":"
              ) {
                completion = completion
                  .trimEnd()
                  .substring(0, completion.length - 1);
              }
            }
            let insertText = data.completions[i].split("Explanation:")[0];
            if (configuration.completeLine) {
              insertText = "";
              let lines = data.completions[i].split('\n');
              let ln = 0;
              for (let line of lines) {
                if (line.trim() === "") {
                  insertText += "\n";
                  ln++;
                  continue;
                }
                if (editor.selection.anchor.character === 0) {
                  insertText = line;
                } else {
                  if (ln === 0) {
                    insertText = line.trim();
                  } else {
                    insertText += line;
                  }
                }
                break;
              }
            }
            let command = {
              title: "suggestion-accepted",
              command: "sensecode.onSuggestionAccepted",
              arguments: [
                {
                  type: "code completion",
                  code: textBeforeCursor,
                  prompt: "Please complete the following code"
                },
                data.completions, "", i.toString(), ts]
            };

            items.push({
              // insertText: completion,
              insertText,
              // range: new vscode.Range(endPosition.translate(0, rs.completions.length), endPosition),
              range: new vscode.Range(
                position.translate(0, data.completions.length),
                position
              ),
              command
            });
            trie.addWord(textBeforeCursor + data.completions[i]);
          }
          if (data.completions.length === 0) {
            updateStatusBarItem(
              statusBarItem,
              {
                text: "$(bracket)",
                tooltip: vscode.l10n.t("No completion suggestion")
              }
            );
          } else if (!cancel.isCancellationRequested) {
            updateStatusBarItem(
              statusBarItem,
              {
                text: "$(pass)",
                tooltip: vscode.l10n.t("Done")
              }
            );
          }
          return cancel.isCancellationRequested ? null : items;
        }
      }
    },
  };
  return provider;
}
