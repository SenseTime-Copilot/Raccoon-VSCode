import * as vscode from "vscode";
import { updateStatusBarItem } from "../utils/updateStatusBarItem";
import { sensecodeManager, outlog } from "../extension";
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
      let editor = vscode.window.activeTextEditor;
      if (!editor) {
        return;
      }
      let loggedin = sensecodeManager.isClientLoggedin();
      if (!loggedin) {
        updateStatusBarItem(
          statusBarItem,
          {
            text: "$(workspace-untrusted)",
            tooltip: vscode.l10n.t("User cancelled")
          }
        );
        return;
      }
      if (context.triggerKind === vscode.InlineCompletionTriggerKind.Automatic && !sensecodeManager.autoComplete) {
        return;
      }
      if (context.triggerKind === vscode.InlineCompletionTriggerKind.Automatic) {
        if (middleOfLineWontComplete(position, document)) {
          updateStatusBarItem(statusBarItem);
          return;
        }

        await new Promise((f) => setTimeout(f, (sensecodeManager.delay - 1) * 1000));
        if (!cancel.isCancellationRequested) {
          vscode.commands.executeCommand("editor.action.inlineSuggest.trigger", vscode.window.activeTextEditor);
        }
        return;
      }

      showHideStatusBtn(document, statusBarItem);

      if (!editor.selection.isEmpty) {
        vscode.commands.executeCommand("editor.action.codeAction", { kind: vscode.CodeActionKind.QuickFix.append("sensecode").value });
        return;
      }

      let maxLength = sensecodeManager.maxToken() / 2;
      let codeSnippets = await captureCode(document, position, maxLength);

      if (codeSnippets.prefix.length === 0 && codeSnippets.suffix.length === 0) {
        updateStatusBarItem(statusBarItem);
        return;
      }
      if (context.triggerKind === vscode.InlineCompletionTriggerKind.Invoke) {
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
        let stopToken: string = "<|end|>";
        let requestId = new Date().getTime();
        lastRequest = requestId;
        if (lastRequest !== requestId) {
          return;
        }
        let data: any;
        try {
          updateStatusBarItem(
            statusBarItem,
            {
              text: "$(loading~spin)",
              tooltip: vscode.l10n.t("Thinking..."),
              keep: true
            }
          );

          let mt = 128;

          const completionPrompt = {
            prologue: `<|system|>\n<|end|>`,
            prompt: `<|user|>
<fim_prefix>Please do not provide any explanations at the end. Please complete the following code.

${codeSnippets.prefix}<fim_suffix>${codeSnippets.suffix}<fim_middle><|end|>`,
            suffix: "<|assistant|>",
          };

          data = await sensecodeManager.getCompletions(
            completionPrompt,
            sensecodeManager.candidates,
            mt,
            stopToken,
            controller.signal);
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
                text: `$(alert)${err.response?.statusText || ""}`,
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
        if (data === null || data.choices === null || data.choices.length === 0) {
          updateStatusBarItem(
            statusBarItem,
            {
              text: "$(array)",
              tooltip: vscode.l10n.t("No completion suggestion")
            }
          );
          return;
        }

        // Add the generated code to the inline suggestion list
        let items = new Array<vscode.InlineCompletionItem>();
        let ts = new Date().valueOf();
        let codeArray = data.choices;
        const completions = Array<string>();
        for (let i = 0; i < codeArray.length; i++) {
          const completion = codeArray[i];
          let tmpstr: string = completion.text || "";
          if (!tmpstr.trim()) {
            continue;
          }
          if (completions.includes(tmpstr)) {
            continue;
          }
          completions.push(tmpstr);
        }
        for (let i = 0; i < completions.length; i++) {
          let completion = completions[i].replace(stopToken, "");
          let insertText = completion;
          let replace: vscode.Range | undefined;
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
              completions, "", i.toString(), ts]
          };
          outlog.debug(insertText);
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

