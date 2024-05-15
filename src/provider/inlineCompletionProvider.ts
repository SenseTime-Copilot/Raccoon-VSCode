import * as vscode from "vscode";
import { updateStatusBarItem } from "../utils/updateStatusBarItem";
import { raccoonManager, telemetryReporter, extensionNameKebab } from "../globalEnv";
import { CompletionPreferenceType, RaccoonRequestParam } from "./raccoonManager";
import { Choice, MetricType } from "../raccoonClient/CodeClient";
import { buildHeader } from "../utils/buildRequestHeader";
import { ModelCapacity } from "./config";
import { docSymbolMap } from "../extension";

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

  let refs = '';
  let len = codeSnippets.prefix.length + codeSnippets.suffix.length;
  for (let s of codeSnippets.relativeSymbol) {
    for (let d of vscode.workspace.textDocuments) {
      if (d.uri.toString() === s.uri) {
        let r = s.symbol.range;
        let t = d.getText(r);
        let c = `// FILE: ${s.uri}#L${r.start.line + 1}-L${r.end.line + 2}: \n//` + t.split('\n').join('\n//') + '\n\n';
        if (len + c.length <= maxLength) {
          refs += c;
          len += c.length;
        }
      }
    }
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

  let content = raccoonManager.buildFillPrompt(ModelCapacity.completion, document.languageId, refs + codeSnippets.prefix, codeSnippets.suffix);
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

  await raccoonManager.completion(
    content,
    cfg,
    {
      onError(err: Choice) {
        updateStatusBarItem(
          statusBarItem,
          {
            text: "$(warning)",
            tooltip: vscode.l10n.t(err.message?.content || "Unknown error")
          }
        );
      },
      onFinish(choices: Choice[]) {
        for (let i = 0; i < choices.length; i++) {
          let message = choices[i].message?.content;
          if (!message) {
            continue;
          }
          let command = {
            title: "suggestion-accepted",
            command: `${extensionNameKebab}.onSuggestionAccepted`,
            arguments: [
              document.uri,
              document.languageId,
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
        if (items.length > 0) {
          let usage: any = {};
          usage[document.languageId] = {
            // eslint-disable-next-line @typescript-eslint/naming-convention
            code_generate_num: items.length
          };
          // eslint-disable-next-line @typescript-eslint/naming-convention
          telemetryReporter.logUsage(MetricType.codeCompletion, { code_accept_usage: { metrics_by_language: usage } });
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

      if (context.selectedCompletionInfo) {
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
  let relativeSymbol: { uri: string; symbol: vscode.DocumentSymbol }[] = [];
  let processNames: string[] = [];
  function filterSymbol(names: string[]) {
    for (let name of names) {
      if (processNames.includes(name)) {
        continue;
      }
      processNames.push(name);
      for (let r in docSymbolMap) {
        if (r === document.uri.toString()) {
          continue;
        }
        let rs = docSymbolMap[r];
        for (let n of rs) {
          if (names.includes(n.name)) {
            relativeSymbol.push({ uri: r, symbol: n });
          }
        }
      }
    }
  }
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
  if (raccoonManager.workspaceRef) {
    let preNames: string[] = [];
    let postNames: string[] = [];
    await vscode.commands.executeCommand("vscode.provideDocumentRangeSemanticTokens", document.uri, new vscode.Range(new vscode.Position(folding.start, 0), new vscode.Position(cursorY + 1, 0))).then(async (result) => {
      let tokens = result as vscode.SemanticTokens;
      if (!tokens || !tokens.data) {
        return;
      }
      let len = Math.floor(tokens.data.length / 5);
      let p = new vscode.Position(0, 0);
      for (let idx = 0; idx < len; idx++) {
        let tpos = idx * 5;
        let deltaLine = tokens.data[tpos];
        let startChar = tokens.data[tpos + 1];
        let length = tokens.data[tpos + 2];
        let tokenType = tokens.data[tpos + 3];
        if (deltaLine !== 0) {
          p = p.with(undefined, 0);
        }
        if (tokenType === 0 || tokenType === 2 || tokenType === 10 || tokenType === 11) {
          let range = new vscode.Range(p.translate(deltaLine, startChar), p.translate(deltaLine, startChar + length));
          let name = document.getText(range);
          preNames.push(name);
        }
        preNames.reverse();
        p = p.translate(deltaLine, startChar);
      }
    });
    await vscode.commands.executeCommand("vscode.provideDocumentRangeSemanticTokens", document.uri, new vscode.Range(new vscode.Position(cursorY, cursorX), new vscode.Position(folding.end, document.lineAt(folding.end).text.length))).then(async (result) => {
      let tokens = result as vscode.SemanticTokens;
      if (!tokens || !tokens.data) {
        return;
      }
      let len = Math.floor(tokens.data.length / 5);
      let p = new vscode.Position(0, 0);
      for (let idx = 0; idx < len; idx++) {
        let tpos = idx * 5;
        let deltaLine = tokens.data[tpos];
        let startChar = tokens.data[tpos + 1];
        let length = tokens.data[tpos + 2];
        let tokenType = tokens.data[tpos + 3];
        if (deltaLine !== 0) {
          p = p.with(undefined, 0);
        }
        if (tokenType === 0 || tokenType === 2 || tokenType === 10 || tokenType === 11) {
          let range = new vscode.Range(p.translate(deltaLine, startChar), p.translate(deltaLine, startChar + length));
          let name = document.getText(range);
          postNames.push(name);
        }
        p = p.translate(deltaLine, startChar);
      }
    });
    let n1 = preNames.length;
    let n2 = postNames.length;
    let names: string[] = [];
    for (let i = 0; i < n1; i++) {
      names.push(preNames[i]);
      if (n2 >= n1) {
        names.push(postNames[i]);
      }
      if (i === (n1 - 1) && n2 > n1) {
        for (let j = i + 1; j < n2; j++) {
          names.push(postNames[j]);
        }
      }
    }
    filterSymbol(names);
  }
  return { relativeSymbol, prefix, suffix };
}

