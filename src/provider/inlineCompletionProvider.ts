import * as vscode from "vscode";
import { Engine } from "../param/configures";
import { GetCodeCompletions, getCodeCompletions } from "../utils/getCodeCompletions";
import { updateStatusBarItem } from "../utils/updateStatusBarItem";
import { IncomingMessage } from "http";
import { configuration, outlog } from "../extension";
import { getDocumentLanguage } from "../utils/getDocumentLanguage";

let lastRequest = null;

export function showHideStatusBtn(doc: vscode.TextDocument | undefined, statusBarItem: vscode.StatusBarItem) {
  let lang = "";
  if (doc) {
    lang = getDocumentLanguage(doc.languageId);
  }
  if (!lang) {
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

      const activeEngine: Engine = configuration.getActiveEngineInfo();
      let engine = { ...activeEngine };
      engine.config = { ...activeEngine.config };
      engine.config.stop = "\nExplanation:";
      engine.config.max_tokens = 48;

      if (!editor.selection.isEmpty) {
        vscode.commands.executeCommand("editor.action.codeAction", { kind: vscode.CodeActionKind.QuickFix.append("sensecode").value });
        return;
      }

      if (middleOfLineWontComplete(position, document)) {
        updateStatusBarItem(statusBarItem);
        return;
      }

      let maxLength = configuration.tokenForPrompt(engine.label) * 2;
      let codeSnippets = await captureCode(document, position, maxLength);

      if (codeSnippets.prefix.length === 0 && codeSnippets.suffix.length === 0) {
        updateStatusBarItem(statusBarItem);
        return;
      }
      if (context.triggerKind === vscode.InlineCompletionTriggerKind.Invoke) {
        let requestId = new Date().getTime();
        lastRequest = requestId;
        if (lastRequest !== requestId) {
          return;
        }
        let rs: GetCodeCompletions | any;
        try {
          updateStatusBarItem(
            statusBarItem,
            {
              text: "$(loading~spin)",
              tooltip: vscode.l10n.t("Thinking..."),
              keep: true
            }
          );
          let prefix = `${vscode.l10n.t("Complete following {lang} code:\n", { lang: getDocumentLanguage(document.languageId) })}`;
          let suffix = ``;
          prefix = `Below is an instruction that describes a task. Write a response that appropriately completes the request.

### Instruction:
Task type: code completion. Please complete the following ${getDocumentLanguage(document.languageId)} code, just response code only.

### Input:
${codeSnippets.prefix}
`;
          suffix = `### Response:
`;
          rs = await getCodeCompletions(engine,
            `${prefix}\n${suffix}`,
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
              text: "$(array)",
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
            let completion = data.completions[i].split("\nExplanation")[0];
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

            let lines = completion.split("\n");
            let insertText = "";
            let replace: vscode.Range | undefined;
            for (let line = 0; line < lines.length; line++) {
              if (lines[line].trim()) {
                let leadingWs = lines[line].length - lines[line].trimStart().length;
                let nextLineIndent = 0;
                if (line < lines.length - 1) {
                  nextLineIndent = (lines[line + 1].length - lines[line + 1].trimStart().length) - leadingWs;
                }
                let curLine = document.lineAt(position.line);
                if (curLine.isEmptyOrWhitespace) {
                  let curleadingWs = position.character;
                  replace = new vscode.Range(
                    new vscode.Position(position.line, position.character),
                    curLine.range.end
                  );
                  leadingWs = Math.max(0, (leadingWs - curleadingWs));
                }
                if (line === lines.length - 1) {
                  insertText = ' '.repeat(leadingWs) + lines[line].trimStart() + '\n';
                } else {
                  let leading = position.character + nextLineIndent;
                  insertText = ' '.repeat(leadingWs) + lines[line].trimStart() + '\n' + ' '.repeat(leading);
                }
                break;
              }
            }

            if (!insertText.trim()) {
              continue;
            }
            let command = {
              title: "suggestion-accepted",
              command: "sensecode.onSuggestionAccepted",
              arguments: [
                {
                  type: "code completion",
                  language: getDocumentLanguage(document.languageId),
                  code: [codeSnippets.prefix, codeSnippets.suffix],
                  prompt: "Please complete the following code"
                },
                data.completions, "", i.toString(), ts]
            };
            items.push({ insertText, range: replace, command });
          }
          if (items.length === 0) {
            updateStatusBarItem(
              statusBarItem,
              {
                text: "$(array)",
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

export async function captureCode(document: vscode.TextDocument, position: vscode.Position, maxLength: number) {
  let foldings: vscode.FoldingRange[] = await vscode.commands.executeCommand("vscode.executeFoldingRangeProvider", document.uri);
  let cursorX = position.character;
  let cursorY = position.line;
  let foldingPoints = [new vscode.FoldingRange(0, document.lineCount - 1)];
  let preCutLines: number[] = [];
  let postCutLines: number[] = [];
  if (foldings && foldings.length > 0) {
    for (let r of foldings) {
      if (r.start < cursorY && r.end >= cursorY) {
        foldingPoints.push(r);
      } else if (r.end < cursorY) {
        preCutLines.push(r.end + 1);
      } else if (r.start > cursorY) {
        postCutLines = [r.start - 1, ...postCutLines];
      }
    }
  }
  let pos = 0;
  let prefix = document.getText(new vscode.Selection(
    0,
    0,
    cursorY,
    cursorX
  ));
  let suffix = document.getText(new vscode.Selection(
    cursorY,
    cursorX,
    document.lineCount - 1,
    document.lineAt(document.lineCount - 1).text.length
  ));
  let folding = foldingPoints[pos];
  while ((prefix.length + suffix.length) > maxLength) {
    if (foldingPoints.length > pos) {
      folding = foldingPoints[pos];
      pos++;
    } else {
      let preIdx = 0;
      let postIdx = 0;
      for (preIdx = 0; preIdx < preCutLines.length; preIdx++) {
        if (preCutLines[preIdx] > folding.start) {
          break;
        }
      }
      for (postIdx = 0; postIdx < postCutLines.length; postIdx++) {
        if (postCutLines[postIdx] < folding.end) {
          break;
        }
      }
      if (prefix.length > suffix.length) {
        if (preIdx < preCutLines.length) {
          folding.start = preCutLines[preIdx];
        } else {
          folding.start = Math.min(cursorY, folding.start + 1);
        }
      } else {
        if (postIdx < postCutLines.length) {
          folding.end = postCutLines[postIdx];
        } else {
          folding.end = Math.max(cursorY, folding.end - 1);
        }
      }
    }
    prefix = document.getText(new vscode.Selection(
      folding.start,
      0,
      cursorY,
      cursorX
    ));
    suffix = document.getText(new vscode.Selection(
      cursorY,
      cursorX,
      folding.end,
      document.lineAt(folding.end).text.length
    ));
  }
  return { prefix, suffix };
}

