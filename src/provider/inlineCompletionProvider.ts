import * as vscode from "vscode";
import { updateStatusBarItem } from "../utils/updateStatusBarItem";
import { raccoonManager, outlog, telemetryReporter, extensionNameKebab } from "../globalEnv";
import { CompletionPreferenceType, RaccoonRequestParam } from "./raccoonManager";
import { Choice } from "../raccoonClient/CodeClient";
import { buildHeader } from "../utils/buildRequestHeader";
import { ModelCapacity } from "./contants";

export function showHideStatusBtn(doc: vscode.TextDocument | undefined, statusBarItem: vscode.StatusBarItem): boolean {
  if (doc) {
    statusBarItem.show();
    return true;
  } else {
    statusBarItem.hide();
    return false;
  }
}

async function getCompletionSuggestions(extension: vscode.ExtensionContext, document: vscode.TextDocument, position: vscode.Position, cancel: vscode.CancellationToken, statusBarItem: vscode.StatusBarItem) {
  let abortCtler: AbortController;
  cancel.onCancellationRequested(_e => {
    abortCtler.abort();
  });
  let maxLength = raccoonManager.maxInputTokenNum(ModelCapacity.completion) * 2;
  let codeSnippets = await captureCode(document, position, maxLength);

  if (codeSnippets.prefix.trim().replace(/[\s\/\\,?_#@!~$%&*]/g, "").length < 4) {
    updateStatusBarItem(statusBarItem);
    return;
  }

  let items = new Array<vscode.InlineCompletionItem>();
  let lenPreference = raccoonManager.completionPreference;
  updateStatusBarItem(
    statusBarItem,
    {
      text: "$(loading~spin)",
      tooltip: vscode.l10n.t("Thinking..."),
      keep: true
    }
  );

  let content = raccoonManager.buildFillPrompt(ModelCapacity.completion, document.languageId, codeSnippets.prefix, codeSnippets.suffix);
  if (!content) {
    updateStatusBarItem(statusBarItem,
      {
        text: "$(exclude)",
        tooltip: vscode.l10n.t("Out of service")
      });
    return;
  }

  let cfg: RaccoonRequestParam = {
    stream: false,
    n: raccoonManager.candidates,
    maxNewTokenNum: 1024//(raccoonManager.totalTokenNum(ModelCapacity.completion) - raccoonManager.maxInputTokenNum(ModelCapacity.completion))
  };
  if (lenPreference === CompletionPreferenceType.balanced) {
    cfg.maxNewTokenNum = 256;
  } else if (lenPreference === CompletionPreferenceType.singleLine) {
    cfg.maxNewTokenNum = 128;
    cfg.stop = ["\n"];
  }

  telemetryReporter.logUsage("suggestion");

  await raccoonManager.completion(
    content,
    cfg,
    {
      onError(err: Choice) {
        updateStatusBarItem(
          statusBarItem,
          {
            text: "$(circle-slash)",
            tooltip: vscode.l10n.t(err.message?.content || "Unknown error")
          }
        );
      },
      onFinish(choices: Choice[]) {
        for (let i = 0; i < choices.length; i++) {
          outlog.debug(JSON.stringify(choices[i]));
          let message = choices[i].message?.content;
          if (!message) {
            continue;
          }
          let command = {
            title: "suggestion-accepted",
            command: `${extensionNameKebab}.onSuggestionAccepted`,
            arguments: [
              document.uri,
              new vscode.Range(position.with({ character: 0 }), position.with({ line: position.line + message.split('\n').length - 1, character: 0 })),
              i.toString()
            ]
          };
          let afterCursor = document.lineAt(position.line).text.slice(position.character);
          items.push({
            insertText: message,
            range: new vscode.Range(new vscode.Position(position.line, position.character),
              new vscode.Position(position.line, position.character + afterCursor.length)),
            command
          });
        }
        updateStatusBarItem(
          statusBarItem,
          {
            text: items.length > 0 ? "$(pass)" : "$(array)",
            tooltip: items.length > 0 ? vscode.l10n.t("Done") : vscode.l10n.t("No completion suggestion")
          }
        );
      },
      onController(controller) {
        abortCtler = controller;
      },
    },
    buildHeader(extension.extension, 'inline completion', `${new Date().valueOf()}`)
  );

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
        let delay = raccoonManager.completionDelay;
        await new Promise((f) => setTimeout(f, delay > 75 ? delay : 75));
        if (!cancel.isCancellationRequested) {
          vscode.commands.executeCommand("editor.action.inlineSuggest.trigger", vscode.window.activeTextEditor);
        }
        return;
      }

      if (context.triggerKind !== vscode.InlineCompletionTriggerKind.Invoke || cancel.isCancellationRequested) {
        return;
      }

      return getCompletionSuggestions(extension, document, position, cancel, statusBarItem);
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

