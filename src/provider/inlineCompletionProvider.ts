import * as vscode from "vscode";
import { updateStatusBarItem } from "../utils/updateStatusBarItem";
import { raccoonManager, outlog } from "../extension";
import { CompletionPreferenceType, ModelCapacity } from "./raccoonManager";
import { Message, ResponseData, Role } from "../raccoonClient/src/CodeClient";
import { buildHeader } from "../utils/buildRequestHeader";

export function showHideStatusBtn(doc: vscode.TextDocument | undefined, statusBarItem: vscode.StatusBarItem): boolean {
  if (doc) {
    statusBarItem.show();
    return true;
  } else {
    statusBarItem.hide();
    return false;
  }
}

async function getCompletionSuggestions(extension: vscode.ExtensionContext, document: vscode.TextDocument, position: vscode.Position, cancel: vscode.CancellationToken, controller: AbortController, statusBarItem: vscode.StatusBarItem) {

  let maxLength = raccoonManager.maxInputTokenNum(ModelCapacity.completion) / 2;
  let codeSnippets = await captureCode(document, position, maxLength);

  if (codeSnippets.prefix.trim().replace(/[\s\/\\,?_#@!~$%&*]/g, "").length < 4) {
    updateStatusBarItem(statusBarItem);
    return;
  }

  let data: ResponseData;
  try {
    updateStatusBarItem(
      statusBarItem,
      {
        text: "$(loading~spin)",
        tooltip: vscode.l10n.t("Thinking..."),
        keep: true
      }
    );

    let mt = undefined;
    let lenPreference = raccoonManager.completionPreference;
    if (lenPreference === CompletionPreferenceType.balanced) {
      mt = 128;
    } else if (lenPreference === CompletionPreferenceType.speedPriority) {
      mt = 64;
    }

    let content = raccoonManager.buildFillPrompt(ModelCapacity.completion, document.languageId, codeSnippets.prefix, codeSnippets.suffix);
    if (!content) {
      updateStatusBarItem(statusBarItem,
        {
          text: "$(exclude)",
          tooltip: vscode.l10n.t("Out of service")
        });
      return;
    }
    const completionPrompt: Message = {
      role: Role.completion,
      content
    };

    data = await raccoonManager.getCompletions(
      ModelCapacity.completion,
      {
        messages: [completionPrompt],
        n: raccoonManager.candidates,
        maxNewTokenNum: mt
      },
      {
        headers: buildHeader(extension.extension, 'inline completion'),
        signal: controller.signal
      });
  } catch (err: any) {
    if (err.message === "canceled") {
      return;
    }
    outlog.error(err);
    let error = err.response?.data?.error?.message || err.message || "";
    if (!cancel.isCancellationRequested) {
      updateStatusBarItem(
        statusBarItem,
        {
          text: `$(error)${err.response?.statusText || err.response?.status || ""}`,
          tooltip: error
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

  let range = new vscode.Range(new vscode.Position(position.line, 0),
    new vscode.Position(position.line, position.character));
  let prefix = document.getText(range);

  let afterCursor = document.lineAt(position.line).text.slice(position.character);

  // Add the generated code to the inline suggestion list
  let items = new Array<vscode.InlineCompletionItem>();
  let continueFlag = new Array<boolean>();
  let codeArray = data.choices;
  const completions = Array<string>();
  for (let i = 0; i < codeArray.length; i++) {
    const completion = codeArray[i];
    let tmpstr: string = completion.message?.content || "";
    if (!tmpstr.trim()) {
      outlog.debug('[Ignore: Empty Suggestion]');
      continue;
    }
    if (afterCursor) {
      if (!tmpstr.trim().endsWith(afterCursor)) {
        outlog.debug('[Ignore: After Cursor Mismatch]');
        continue;
      }
      tmpstr = tmpstr.trimEnd().slice(0, tmpstr.length - afterCursor.length - 1);
      if (!tmpstr.trim()) {
        outlog.debug('[Ignore: Empty Suggestion]');
        continue;
      }
    }
    if (completions.includes(tmpstr)) {
      outlog.debug('[Ignore: Duplicated Suggestion]: ' + tmpstr);
      continue;
    }
    if (completion.finishReason === 'length') {
      continueFlag.push(true);
      outlog.debug('[Truncated Suggestion]: ' + tmpstr);
    } else {
      continueFlag.push(false);
      outlog.debug('[Completed Suggestion]: ' + tmpstr);
    }
    completions.push(tmpstr);
  }
  for (let i = 0; i < completions.length; i++) {
    let completion = completions[i];
    let command = {
      title: "suggestion-accepted",
      command: "raccoon.onSuggestionAccepted",
      arguments: [
        document.uri,
        new vscode.Range(position.with({ character: 0 }), position.with({ line: position.line + completion.split('\n').length - 1, character: 0 })),
        continueFlag[i],
        i.toString()
      ]
    };
    items.push({
      insertText: prefix + completion,
      range: new vscode.Range(new vscode.Position(position.line, 0),
        new vscode.Position(position.line, position.character)),
      command
    });
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
      if (!showHideStatusBtn(document, statusBarItem)) {
        return;
      }

      let loggedin = raccoonManager.isClientLoggedin();
      if (!loggedin) {
        updateStatusBarItem(
          statusBarItem,
          {
            text: "$(workspace-untrusted)",
            tooltip: vscode.l10n.t("Unauthorized")
          }
        );
        return;
      }
      if (context.triggerKind === vscode.InlineCompletionTriggerKind.Automatic && !raccoonManager.autoComplete) {
        return;
      }

      if (context.triggerKind === vscode.InlineCompletionTriggerKind.Automatic) {
        await new Promise((f) => setTimeout(f, (raccoonManager.delay - 1) * 1000));
        if (!cancel.isCancellationRequested) {
          vscode.commands.executeCommand("editor.action.inlineSuggest.trigger", vscode.window.activeTextEditor);
        }
        return;
      }

      if (context.triggerKind !== vscode.InlineCompletionTriggerKind.Invoke || cancel.isCancellationRequested) {
        return;
      }

      return getCompletionSuggestions(extension, document, position, cancel, controller, statusBarItem);
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
  preCutLines.sort((a, b) => {
    return a - b;
  });
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

