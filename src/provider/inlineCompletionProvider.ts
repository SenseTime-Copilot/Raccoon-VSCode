import * as vscode from "vscode";
import { Engine } from "../param/configures";
import { Trie } from "./trie";
import { GetCodeCompletions, getCodeCompletions } from "../utils/getCodeCompletions";
import { updateStatusBarItem } from "../utils/updateStatusBarItem";
import { IncomingMessage } from "http";
import { configuration, outlog } from "../extension";

let lastRequest = null;
let trie = new Trie([]);

function getDocumentLanguage(document: vscode.TextDocument) {
  const documentLanguageId: string = document.languageId;
  let lang = "";
  switch (documentLanguageId) {
    case "cpp":
      lang = "C++";
      break;
    case "c":
      lang = "C";
      break;
    case "csharp":
      lang = "C#";
      break;
    case "cuda-cpp":
      lang = "Cuda";
      break;
    case "objective-c":
      lang = "Objective-C";
      break;
    case "objective-cpp":
      lang = "Objective-C++";
      break;
    case "markdown":
      lang = "Markdown";
      break;
    case "python":
      lang = "Python";
      break;
    case "java":
      lang = "Java";
      break;
    case "tex":
      lang = "TeX";
      break;
    case "html":
      lang = "HTML";
      break;
    case "php":
      lang = "PHP";
      break;
    case "javascript":
    case "javascriptreact":
      lang = "JavaScript";
      break;
    case "typescript":
    case "typescriptreact":
      lang = "TypeScript";
      break;
    case "go":
      lang = "Go";
      break;
    case "shellscript":
      lang = "Shell";
      break;
    case "rust":
      lang = "Rust";
      break;
    case "css":
    case "less":
    case "sass":
    case "scss":
      lang = "CSS";
      break;
    case "sql":
      lang = "SQL";
      break;
    case "r":
      lang = "R";
      break;
    default:
      lang = "";
  }
  return lang;
}

export function showHideStatusBtn(doc: vscode.TextDocument | undefined, statusBarItem: vscode.StatusBarItem) {
  let lang = "";
  if (doc) {
    lang = getDocumentLanguage(doc);
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
      cancel.onCancellationRequested(_e => {
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
        await new Promise((f) => setTimeout(f, configuration.delay * 1000));
        if (!cancel.isCancellationRequested) {
          vscode.commands.executeCommand("editor.action.inlineSuggest.trigger", vscode.window.activeTextEditor);
        }
        return;
      }

      showHideStatusBtn(document, statusBarItem);
      let selection: vscode.Selection = editor.selection;
      if (editor.selection.isEmpty) {
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
          let activeEngine: Engine | undefined = extension.globalState.get("engine");
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
          let maxTokens = activeEngine.config.max_tokens || 128;
          if (configuration.printOut && activeEngine.streamConfig && activeEngine.streamConfig.max_tokens) {
            maxTokens = activeEngine.streamConfig.max_tokens;
          }
          if (textBeforeCursor.length > (maxTokens * 4)) {
            textBeforeCursor = textBeforeCursor.slice(-4 * maxTokens);
          }
          let prefix = `${vscode.l10n.t("Complete following {lang} code:\n", { lang: document.languageId })}`;
          let suffix = ``;
          prefix = `Below is an instruction that describes a task. Write a response that appropriately completes the request.

### Instruction:
Task type: code completion. Please complete the following code.

### Input:
`;
          suffix = `### Response:
`;
          rs = await getCodeCompletions(activeEngine,
            `${prefix}\n${textBeforeCursor}\n${suffix}`,
            configuration.printOut);
        } catch (err: any) {
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
          let data = rs as IncomingMessage;
          let start = editor.selection.start;
          let end = editor.selection.start;
          updateStatusBarItem(
            statusBarItem,
            {
              text: "$(pencil)",
              tooltip: vscode.l10n.t("Typing..."),
              keep: true
            }
          );
          data.on("data", async (v: any) => {
            let msgstr: string = v.toString();
            let msgs = msgstr.split("\n");
            for (let msg of msgs) {
              if (cancel.isCancellationRequested) {
                data.destroy();
                updateStatusBarItem(
                  statusBarItem,
                  {
                    text: "$(circle-slash)",
                    tooltip: vscode.l10n.t("User cancelled")
                  }
                );
                return;
              }
              if (msg === "") {
                continue;
              }
              let content = "";
              if (msg.startsWith("data:")) {
                content = msg.slice(5).trim();
              } else if (msg.startsWith("event:")) {
                content = msg.slice(6).trim();
                outlog.error(content);
                if (content === "error") {
                  updateStatusBarItem(
                    statusBarItem,
                    {
                      text: "$(alert)",
                      tooltip: new vscode.MarkdownString(msgs[1])
                    }
                  );
                  data.destroy();
                }
                return;
              } else {
                updateStatusBarItem(
                  statusBarItem,
                  {
                    text: "$(alert)",
                    tooltip: msg
                  }
                );
                data.destroy();
                return;
              }
              if (content === '[DONE]') {
                updateStatusBarItem(
                  statusBarItem,
                  {
                    text: "$(pass)",
                    tooltip: vscode.l10n.t("Done")
                  }
                );
                outlog.debug(content);
                data.destroy();
                return;
              }
              if (content === "") {
                continue;
              }
              try {
                let json = JSON.parse(content);
                outlog.debug(JSON.stringify(json, undefined, 2));
                if (json.error) {
                  vscode.window.showErrorMessage(`${json.error.type}: ${json.error.message}`, vscode.l10n.t("Close"));
                  data.destroy();
                  return;
                } else if (json.choices && json.choices[0]) {
                  let value = json.choices[0].text || json.choices[0].message?.content;
                  if (value) {
                    if (editor && editor.selection && start === editor.selection.active && !cancel.isCancellationRequested) {
                      await editor.edit(e => {
                        e.insert(start, value);
                      }).then(() => {
                        end = editor!.selection.start;
                        editor!.revealRange(new vscode.Range(start, end));
                        start = end;
                      });
                    } else {
                      data.destroy();
                      updateStatusBarItem(
                        statusBarItem,
                        {
                          text: "$(circle-slash)",
                          tooltip: vscode.l10n.t("User cancelled")
                        }
                      );
                      return;
                    }
                  }
                }
              } catch (e) {
                outlog.error(content);
              }
            }
          });
        } else {
          let data = rs as GetCodeCompletions;
          // Add the generated code to the inline suggestion list
          let items = new Array<vscode.InlineCompletionItem>();
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
            items.push({
              // insertText: completion,
              insertText: data.completions[i],
              // range: new vscode.Range(endPosition.translate(0, rs.completions.length), endPosition),
              range: new vscode.Range(
                position.translate(0, data.completions.length),
                position
              )
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
