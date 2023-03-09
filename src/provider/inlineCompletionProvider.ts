import * as vscode from "vscode";
import { Configuration } from "../param/configures";
import { Trie } from "./trie";
import { getCodeCompletions } from "../utils/getCodeCompletions";
import { updateStatusBarItem } from "../utils/updateStatusBarItem";

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
    return lang;
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
            if (context.triggerKind === vscode.InlineCompletionTriggerKind.Automatic && !Configuration.autoCompleteEnabled) {
                return;
            }

            let lang = showHideStatusBtn(document, statusBarItem);
            if (lang === "") {
                return;
            }
            let selection: vscode.Selection;
            selection = new vscode.Selection(
                0,
                0,
                position.line,
                position.character
            );
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
                updateStatusBarItem(extension, statusBarItem, "");
                return { items: [] };
            }

            if (middleOfLineWontComplete(position, document) && context.triggerKind === vscode.InlineCompletionTriggerKind.Automatic) {
                updateStatusBarItem(extension, statusBarItem, "");
                return;
            }

            if (textBeforeCursor.length > 8 || context.triggerKind === vscode.InlineCompletionTriggerKind.Invoke) {
                let requestId = new Date().getTime();
                lastRequest = requestId;
                if (context.triggerKind === vscode.InlineCompletionTriggerKind.Automatic) {
                    await new Promise((f) => setTimeout(f, Configuration.delay));
                }
                if (lastRequest !== requestId) {
                    return { items: [] };
                }
                let rs;
                try {
                    updateStatusBarItem(extension, statusBarItem, "$(sync~spin)");
                    rs = await getCodeCompletions(extension,
                        textBeforeCursor,
                        lang);
                } catch (err) {
                    if (err) {
                        console.log(err);
                    }
                    updateStatusBarItem(extension,
                        statusBarItem,
                        "$(bracket-error)"
                    );
                    return { items: [] };
                }
                if (rs === null) {
                    updateStatusBarItem(extension,
                        statusBarItem,
                        "$(bracket-error)"
                    );
                    return { items: [] };
                }

                // Add the generated code to the inline suggestion list
                let items = new Array<vscode.InlineCompletionItem>();
                for (let i = 0; i < rs.completions.length; i++) {
                    let completion = rs.completions[i];
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
                        insertText: rs.completions[i],
                        // range: new vscode.Range(endPosition.translate(0, rs.completions.length), endPosition),
                        range: new vscode.Range(
                            position.translate(0, rs.completions.length),
                            position
                        )
                    });
                    trie.addWord(textBeforeCursor + rs.completions[i]);
                }
                if (rs.completions.length === 0) {
                    updateStatusBarItem(extension,
                        statusBarItem,
                        "$(bracket-error)"
                    );
                } else {
                    updateStatusBarItem(extension,
                        statusBarItem,
                        "$(bracket-dot)"
                    );
                }
                return items;
            }
            updateStatusBarItem(extension,
                statusBarItem,
                "$(bracket-error)"
            );
            return { items: [] };
        },
    };
    return provider;
}
