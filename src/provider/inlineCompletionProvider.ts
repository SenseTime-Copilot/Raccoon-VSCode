import * as vscode from "vscode";
import { apiKey, apiSecret } from "../localconfig";
import { completionDelay } from "../param/configures";
import { Trie } from "../trie";
import { getCodeCompletions } from "../utils/getCodeCompletions";
import getDocumentLanguage from "../utils/getDocumentLanguage";
import { updateStatusBarItem } from "../utils/updateStatusBarItem";

let lastRequest = null;
let trie = new Trie([]);
let prompts: string[] = [];
let someTrackingIdCounter = 0;
let delay: number = completionDelay * 1000;

function middleOfLineWontComplete(editor: any, document: any) {
    const cursorPosition = editor.selection.active;
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

function isAtTheMiddleOfLine(editor: any, document: any) {
    const cursorPosition = editor.selection.active;
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

interface MyInlineCompletionItem extends vscode.InlineCompletionItem {
    trackingId: number;
}
export default function inlineCompletionProvider(
    myStatusBarItem: vscode.StatusBarItem,
    reGetCompletions: boolean,
) {
    const provider: vscode.InlineCompletionItemProvider = {
        provideInlineCompletionItems: async (
            document,
            position,
            context,
            token
        ) => {
            const editor = vscode.window.activeTextEditor;
            if (!editor) {
                vscode.window.showInformationMessage(
                    "Please open a file first to use SenseCode."
                );
                return;
            }
            let selection: vscode.Selection;
            const cursorPosition = editor.selection.active;
            selection = new vscode.Selection(
                0,
                0,
                cursorPosition.line,
                cursorPosition.character
            );
            let textBeforeCursor = document.getText(selection);
            if (
                cursorPosition.character === 0 &&
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
                updateStatusBarItem(myStatusBarItem, "", "");
                return { items: [] };
            }

            //解决光标之后有除括号空格之外内容，仍然补充造成的调用浪费
            let selectionNextChar: vscode.Selection;

            selectionNextChar = new vscode.Selection(
                cursorPosition.line,
                cursorPosition.character,
                cursorPosition.line,
                cursorPosition.character + 1
            );

            if (middleOfLineWontComplete(editor, document)) {
                updateStatusBarItem(myStatusBarItem, "", "");
                return;
            }
            if (true && !reGetCompletions) {
                for (let prompt of prompts) {
                    if (textBeforeCursor.trimEnd().indexOf(prompt) != -1) {
                        let completions;
                        completions = trie.getPrefix(textBeforeCursor);
                        let useTrim = false;
                        if (completions.length === 0) {
                            completions = trie.getPrefix(
                                textBeforeCursor.trimEnd()
                            );
                            useTrim = true;
                        }
                        if (completions.length == 0) {
                            break;
                        }
                        let items = new Array<MyInlineCompletionItem>();
                        for (
                            let i = 0;
                            i <
                            Math.min(
                                Math.min(completions.length, 1) + 1,
                                completions.length
                            );
                            i++
                        ) {
                            let insertText = useTrim
                                ? completions[i].replace(
                                    textBeforeCursor.trimEnd(),
                                    ""
                                )
                                : completions[i].replace(textBeforeCursor, "");
                            let needRequest = ["", "\n", "\n\n"];
                            if (
                                needRequest.includes(insertText) ||
                                insertText.trim() === ""
                            ) {
                                continue;
                            }
                            if (useTrim) {
                                const lines = insertText.split("\n");
                                let nonNullIndex = 0;
                                while (lines[nonNullIndex].trim() === "") {
                                    nonNullIndex++;
                                }
                                let newInsertText = "";
                                for (
                                    let j = nonNullIndex;
                                    j < lines.length;
                                    j++
                                ) {
                                    newInsertText += lines[j];
                                    if (j !== lines.length - 1) {
                                        newInsertText += "\n";
                                    }
                                }
                                if (
                                    textBeforeCursor[
                                    textBeforeCursor.length - 1
                                    ] === "\n" ||
                                    nonNullIndex === 0
                                ) {
                                    insertText = newInsertText;
                                } else {
                                    insertText = "\n" + newInsertText;
                                }
                            }

                            items.push({
                                insertText,
                                range: new vscode.Range(
                                    position.translate(0, completions.length),
                                    position
                                ),
                                // range: new vscode.Range(endPosition.translate(0, completions.length), endPosition),
                                trackingId: someTrackingIdCounter++,
                            });
                            if (useTrim) {
                                trie.addWord(
                                    textBeforeCursor.trimEnd() + insertText
                                );
                            } else {
                                trie.addWord(textBeforeCursor + insertText);
                            }
                        }
                        if (items.length === 0) {
                            continue;
                        } else {
                            updateStatusBarItem(
                                myStatusBarItem,
                                "$(bracket-dot)",
                                "Done"
                            );
                            return items;
                        }
                    }
                }
            }
            if (textBeforeCursor.length > 8) {
                let requestId = new Date().getTime();
                lastRequest = requestId;
                await new Promise((f) => setTimeout(f, delay));
                if (lastRequest !== requestId) {
                    return { items: [] };
                }
                let rs;
                let lang = "";
                try {
                    if (editor) {
                        lang = getDocumentLanguage(editor);
                    }
                    updateStatusBarItem(myStatusBarItem, "$(sync~spin)", "");
                    rs = await getCodeCompletions(
                        textBeforeCursor,
                        3,
                        lang,
                        apiKey,
                        apiSecret);
                } catch (err) {
                    if (err) {
                        console.log(err);
                    }
                    updateStatusBarItem(
                        myStatusBarItem,
                        "$(bracket-error)",
                        "No Suggestion"
                    );
                    return { items: [] };
                }
                if (rs === null) {
                    updateStatusBarItem(
                        myStatusBarItem,
                        "$(bracket-error)",
                        "No Suggestion"
                    );
                    return { items: [] };
                }
                prompts.push(textBeforeCursor);
                // Add the generated code to the inline suggestion list
                let items = new Array<MyInlineCompletionItem>();
                let cursorPosition = editor.selection.active;
                for (let i = 0; i < rs.completions.length; i++) {
                    let completion = rs.completions[i];
                    if (isAtTheMiddleOfLine(editor, document)) {
                        const cursorPosition = editor.selection.active;
                        let currentLine = document?.lineAt(cursorPosition.line);
                        let lineEndPosition = currentLine?.range.end;
                        let selectionTrailingString: vscode.Selection;

                        selectionTrailingString = new vscode.Selection(
                            cursorPosition.line,
                            cursorPosition.character,
                            cursorPosition.line,
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
                            cursorPosition.translate(0, rs.completions.length),
                            cursorPosition
                        ),
                        trackingId: someTrackingIdCounter++,
                    });
                    trie.addWord(textBeforeCursor + rs.completions[i]);
                }
                if (rs.completions.length === 0) {
                    updateStatusBarItem(
                        myStatusBarItem,
                        "$(bracket-error)",
                        " No Suggestion"
                    );
                } else {
                    updateStatusBarItem(
                        myStatusBarItem,
                        "$(bracket-dot)",
                        "Done"
                    );
                }
                return items;
            }
            updateStatusBarItem(
                myStatusBarItem,
                "$(bracket-error)",
                "No Suggestion"
            );
            return { items: [] };
        },
    };
    return provider;
}
