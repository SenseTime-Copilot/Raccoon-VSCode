import {
  ThemeIcon,
  window,
  EventEmitter,
  l10n,
  ExtensionContext,
} from 'vscode';
import { extensionDisplayName, outlog, raccoonManager, telemetryReporter } from "../globalEnv";
import { Choice, Message, Role } from '../raccoonClient/CodeClient';
import { buildHeader } from '../utils/buildRequestHeader';
import { CacheItem, CacheItemType } from '../utils/historyCache';
import { MetricType, ModelCapacity } from './contants';

function isNonPrintableCharacter(char: string): boolean {
  const charCode = char.charCodeAt(0);
  return charCode < 32 && charCode > 126;
}

function isCtrlC(char: string): boolean {
  const charCode = char.charCodeAt(0);
  return char.length === 1 && charCode === 3;
}

function isUpKey(char: string): boolean {
  if (char.length === 3) {
    const c1 = char.charCodeAt(0);
    const c2 = char.charCodeAt(1);
    const c3 = char.charCodeAt(2);
    return c1 === 27 && c2 === 91 && c3 === 65;
  }
  return false;
}

function isDownKey(char: string): boolean {
  if (char.length === 3) {
    const c1 = char.charCodeAt(0);
    const c2 = char.charCodeAt(1);
    const c3 = char.charCodeAt(2);
    return c1 === 27 && c2 === 91 && c3 === 66;
  }
  return false;
}

function ignoreKeys(char: string): boolean {
  if (isUpKey(char) || isDownKey(char)) {
    return false;
  }
  if (char.length >= 3) {
    const c1 = char.charCodeAt(0);
    return c1 < 32;
  }
  return false;
}

function isEsc(char: string): boolean {
  if (char.length === 1) {
    const c1 = char.charCodeAt(0);
    return c1 === 27;
  }
  return false;
}

function isBksp(char: string): boolean {
  if (char.length === 1) {
    const c1 = char.charCodeAt(0);
    return c1 === 127;
  }
  return false;
}

export class RaccoonTerminal {
  private cacheInput: string = '';
  private cancel?: AbortController;
  private responsing: boolean = false;
  private history: CacheItem[] = [];
  private inputHistory: string[] = [];
  private id: number = 0;
  private curHistoryId = -1;

  constructor(private readonly context: ExtensionContext) {
    let writeEmitter = new EventEmitter<string>();
    let changeNameEmitter = new EventEmitter<string>();
    raccoonManager.onDidChangeStatus((e) => {
      if (!e.quiet && e.scope.includes("active") || e.scope.includes("authorization") || e.scope.includes("engines")) {
        writeEmitter.fire('\r\n');
        welcome();
      }
    });

    // eslint-disable-next-line @typescript-eslint/naming-convention
    // telemetryReporter.logUsage(MetricType.dialog, { terminal_usage: { new_session_num: 1 } });

    let terminal = window.createTerminal({
      name: `${extensionDisplayName}`,
      isTransient: true,
      iconPath: new ThemeIcon('raccoon-icon'),
      pty: {
        onDidWrite: writeEmitter.event,
        onDidChangeName: changeNameEmitter.event,
        open: () => { welcome(); },
        close: () => { },
        handleInput: (input: string) => {
          let username = raccoonManager.username() || "You";
          let robot = raccoonManager.getActiveClientRobotName() || "Raccoon";
          let question = '';
          if (isCtrlC(input)) {
            if (this.responsing) {
              this.cancel?.abort();
              this.responsing = false;
            } else {
              if (this.cacheInput) {
                this.cacheInput = '';
                writeEmitter.fire('\r\n');
              }
              writeEmitter.fire('\x1b[1;34m' + username + " > \x1b[0m\r\n");
            }
            return;
          }
          if (this.responsing) {
            return;
          }
          if (isEsc(input)) {
            if (this.history.length > 0) {
              this.history = [];
              this.curHistoryId = -1;
              if (this.cacheInput) {
                writeEmitter.fire("\x1b[1M");
              }
              this.cacheInput = "";
              writeEmitter.fire("\r\n\x1b[7m  ⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯  new session  ⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯  \x1b[0m\r\n\r\n");
              writeEmitter.fire('\x1b[1;34m' + username + " > \x1b[0m\r\n");

              // eslint-disable-next-line @typescript-eslint/naming-convention
              // telemetryReporter.logUsage(MetricType.dialog, { terminal_usage: { new_session_num: 1 } });
            }
            return;
          } else if (isUpKey(input)) {
            let qlist = this.inputHistory;
            if (qlist.length > this.curHistoryId + 1) {
              this.curHistoryId++;
              this.cacheInput = qlist[this.curHistoryId];
              writeEmitter.fire("\x1b[1M" + this.cacheInput);
            }
            return;
          } else if (isDownKey(input)) {
            let qlist = this.inputHistory;
            if (this.curHistoryId >= 0) {
              this.curHistoryId--;
              if (this.curHistoryId >= 0 && qlist.length > this.curHistoryId) {
                this.cacheInput = qlist[this.curHistoryId];
                writeEmitter.fire("\x1b[1M" + this.cacheInput);
              } else {
                this.cacheInput = "";
                writeEmitter.fire("\x1b[1M");
              }
            }
            return;
          } else if (isNonPrintableCharacter(input) || ignoreKeys(input)) {
            return;
          }

          this.curHistoryId = -1;

          if (input === '\t') {
            return;
          } else if (input === '\r') {
            question = this.cacheInput;
            if (!question) {
              writeEmitter.fire('\x1b[1;34m' + username + " > \x1b[0m\r\n");
              return;
            }
            this.id = new Date().valueOf();
            this.cacheInput = '';
            this.inputHistory = [question, ...this.inputHistory];

            let suffix = '⮨';
            if (window.activeTextEditor && window.activeTextEditor.selection) {
              let doc = window.activeTextEditor.document;
              let code = doc.getText(window.activeTextEditor.selection);
              if (code.trim()) {
                if (doc.languageId !== "plaintext") {
                  code = `\n\`\`\`${doc.languageId}\n${code}\n\`\`\`\n`;
                } else {
                  code = `\n\`\`\`\n${code}\n\`\`\`\n`;
                }
                question += code;
                suffix = ' [CODE]⮨';
              }
            }
            writeEmitter.fire("\x1b[38;5;232m" + suffix);
            writeEmitter.fire("\r\n\r\n\x1b[1;96m" + robot + " > \x1b[0m\r\n");
          } else if (isBksp(input)) {
            if (this.cacheInput.length > 0) {
              if (this.cacheInput.charCodeAt(this.cacheInput.length - 1) > 255) {
                writeEmitter.fire("\b\b  \b\b");
              } else {
                writeEmitter.fire("\b \b");
              }
              this.cacheInput = this.cacheInput.slice(0, -1);
            }
            return;
          } else {
            let msg = input.replace(/\r/g, "\r\n");
            this.cacheInput += msg;
            writeEmitter.fire(msg);
            return;
          }

          this.responsing = true;
          let totalLens: number[] = [];
          for (let h of this.history) {
            let len = h.value.length;
            for (let i = 0; i < totalLens.length; i++) {
              totalLens[i] += len;
            }
            totalLens.push(len);
          }

          for (let j = 0; j < totalLens.length; j++) {
            if ((totalLens[j] + question.length) <= raccoonManager.maxInputTokenNum(ModelCapacity.assistant) / 2) {
              break;
            } else {
              this.history.shift();
            }
          }

          let hlist: Array<Message> = this.history.map((v, _idx, _arr) => {
            return { role: v.type === CacheItemType.question ? Role.user : Role.assistant, content: v.value };
          });

          this.history = this.history.concat([{ id: this.id, timestamp: "", name: username, type: CacheItemType.question, value: question }]);

          // eslint-disable-next-line @typescript-eslint/naming-convention
          telemetryReporter.logUsage(MetricType.dialog, { terminal_usage: { user_question_num: 1 } });

          raccoonManager.chat(
            [...hlist, { role: Role.user, content: raccoonManager.buildFillPrompt(ModelCapacity.assistant, '', question) || "" }],
            {
              stream: true,
              n: 1
            },
            {
              thisArg: this,
              onError: (err: Choice, thisArg?: any) => {
                outlog.error(JSON.stringify(err));
                thisArg.responsing = false;
                thisArg.history.pop();
                thisArg.cacheOutput = "";
                writeEmitter.fire(`\x1b[1;31merror: ${err.message?.content}\x1b[0m`);
                writeEmitter.fire('\r\n\r\n\x1b[1;34m' + username + " > \x1b[0m\r\n");
              },
              onFinish(choices: Choice[], thisArg?: any) {
                thisArg.responsing = false;
                thisArg.history = thisArg.history.concat([{ id: thisArg.id, timestamp: "", name: username, type: CacheItemType.answer, value: thisArg.cacheOutput }]);
                thisArg.cacheOutput = "";
                writeEmitter.fire('\r\n\r\n\x1b[1;34m' + username + " > \x1b[0m\r\n");

                // eslint-disable-next-line @typescript-eslint/naming-convention
                telemetryReporter.logUsage(MetricType.dialog, { terminal_usage: { model_answer_num: 1 } });
              },
              onUpdate(choice: Choice, thisArg?: any) {
                outlog.debug(JSON.stringify(choice));
                let chunk = choice.message?.content;
                if (chunk) {
                  thisArg.cacheOutput += chunk;
                  writeEmitter.fire(chunk.replace(/\n/g, '\r\n'));
                }
              },
              onController(controller, thisArg?: any) {
                thisArg.cancel = controller;
              },
            },
            buildHeader(this.context.extension, 'free chat terminal', `${new Date().valueOf()}`)
          );
        }
      }
    });
    terminal.show();

    function welcome() {
      let un = raccoonManager.username();
      let ai = raccoonManager.getActiveClientRobotName() || "Raccoon";
      ai = raccoonManager.getActiveClientRobotName() || "Raccoon";
      let welcomMsg = l10n.t("Welcome<b>{0}</b>, I'm <b>{1}</b>, your code assistant. You can ask me to help you with your code, or ask me any technical question.", un ? ` ${un}` : "", ai);
      writeEmitter.fire('\x1b[1 q\x1b[1;96m' + ai + ' > \x1b[0;96m' + welcomMsg.replace(/<b>/g, '\x1b[1;96m').replace(/<\/b>/g, '\x1b[0;96m') + '\x1b[0m\r\n');
      writeEmitter.fire('\r\n\x1b[1;34m' + (un || "You") + " > \x1b[0m\r\n");
    }
  }

}