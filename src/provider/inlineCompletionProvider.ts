import * as vscode from "vscode";
import { updateStatusBarItem } from "../utils/updateStatusBarItem";
import { raccoonManager, telemetryReporter, extensionNameKebab, raccoonConfig } from "../globalEnv";
import { CompletionPreferenceType, RaccoonRequestParam } from "./raccoonManager";
import { Choice, CompletionContext, ErrorInfo, MetricType, Reference } from "../raccoonClient/CodeClient";
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

  if ((codeSnippets.input.prefix + codeSnippets.input.suffix).trim().replace(/[\s\/\\,?_#@!~$%&*]/g, "").length < 4) {
    updateStatusBarItem(statusBarItem);
    return [];
  }

  let items = new Array<vscode.InlineCompletionItem>();
  let lenPreference = raccoonManager.completionPreference;
  updateStatusBarItem(
    statusBarItem,
    {
      text: "$(loading~spin)",
      tooltip: raccoonConfig.t("Thinking..."),
      keep: true
    }
  );

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

  return new Promise<vscode.InlineCompletionItem[]>((resolve, reject) => {
    raccoonManager.completion(
      codeSnippets,
      cfg,
      {
        onError(err: ErrorInfo) {
          updateStatusBarItem(
            statusBarItem,
            {
              text: "$(warning)",
              tooltip: raccoonConfig.t(err.detail || "Unknown error")
            }
          );
        },
        onFinish(choices: Choice[]) {
          let lineNum = 0;
          for (let i = 0; i < choices.length; i++) {
            let message = choices[i].message?.content.trimEnd();
            if (!message) {
              continue;
            }
            let afterCursor = document.lineAt(position.line).text.slice(position.character);
            let resultLines = message.split('\n').length - 1;
            let decoratorRange: vscode.Range | undefined;
            if (resultLines > 1 || !afterCursor.trimEnd()) {
              decoratorRange = new vscode.Range(position.with({ character: 0 }), position.with({ line: position.line + resultLines, character: 0 }));
            }
            let command = {
              title: "suggestion-accepted",
              command: `${extensionNameKebab}.onSuggestionAccepted`,
              arguments: [
                document.uri,
                document.languageId,
                i.toString(),
                resultLines + 1,
                decoratorRange
              ]
            };
            let range = new vscode.Range(
              new vscode.Position(position.line, position.character),
              new vscode.Position(position.line, position.character + afterCursor.length)
            );
            items.push({
              insertText: message,
              range,
              command
            });
            lineNum += message.split("\n").length;
          }
          if (items.length > 0) {
            let usage: any = {};
            usage[document.languageId] = {
              // eslint-disable-next-line @typescript-eslint/naming-convention
              code_generate_num: items.length,
              // eslint-disable-next-line @typescript-eslint/naming-convention
              code_generate_line_num: lineNum
            };
            // eslint-disable-next-line @typescript-eslint/naming-convention
            telemetryReporter.logUsage(MetricType.codeCompletion, { code_accept_usage: { metrics_by_language: usage } });
          }
          updateStatusBarItem(
            statusBarItem,
            {
              text: items.length > 0 ? "$(pass)" : "$(array)",
              tooltip: items.length > 0 ? raccoonConfig.t("Done") : raccoonConfig.t("No completion suggestion")
            }
          );
          resolve(cancel.isCancellationRequested ? [] : items);
        },
        onController(controller) {
          abortCtler = controller;
        },
      },
      buildHeader(extension.extension, 'inline completion', `${new Date().valueOf()}`)
    ).catch(e => reject(e));
  });
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

export async function captureCode(document: vscode.TextDocument, position: vscode.Position, maxLength: number): Promise<CompletionContext> {
  let refs: Reference[] = [];
  let processNames: string[] = [];
  async function filterSymbol(names: string[]) {
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
        await matchSymbols(rs, name, r);
      }
    }

    async function matchSymbols(rs: { languageId: string; symbols: vscode.DocumentSymbol[] }, name: string, r: string) {
      for (let n of rs.symbols) {
        if (name === n.name) {
          refs.push({
            languageId: rs.languageId,
            fileName: r,
            fileChunk: (await vscode.workspace.openTextDocument(vscode.Uri.parse(r))).getText(n.range)
          });
        }
        for (let nn of n.children) {
          await matchSymbols(rs, nn.name, r);
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
  let _prefix = document.getText(new vscode.Selection(
    0,
    0,
    cursorY,
    cursorX
  ));
  let _suffix = document.getText(new vscode.Selection(
    cursorY,
    cursorX,
    document.lineCount - 1,
    document.lineAt(document.lineCount - 1).text.length
  ));
  let folding = foldingPoints[pos];
  while ((_prefix.length + _suffix.length) > maxLength) {
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
      if (_prefix.length > _suffix.length) {
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
    _prefix = document.getText(new vscode.Selection(
      folding.start,
      0,
      cursorY,
      cursorX
    ));
    _suffix = document.getText(new vscode.Selection(
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
        p = p.translate(deltaLine, startChar);
      }
      preNames.reverse();
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
    await filterSymbol(names);
  }

  let prefix = _prefix.replace(/\r\n/g, '\n');
  let suffix = _suffix?.replace(/\r\n/g, '\n') || "";
  let _prefixLines = _prefix.split('\n') || [];
  if (_prefixLines.length > 0) {
    delete _prefixLines[_prefixLines.length - 1];
  }
  let _suffixLines = _suffix.split('\n') || [];
  if (_suffixLines.length > 0) {
    delete _suffixLines[0];
  }

  return {
    input: {
      languageId: document.languageId,
      prefix,
      suffix
    },
    localKnows: refs
  };
}
