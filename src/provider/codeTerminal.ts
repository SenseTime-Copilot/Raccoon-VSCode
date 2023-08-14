import {
  ThemeIcon,
  window,
  EventEmitter,
  l10n,
  env
} from 'vscode';
import { sensecodeManager, telemetryReporter } from '../extension';
import { ResponseEvent, Role } from '../sensecodeClient/src/CodeClient';
import { BanWords } from '../utils/swords';

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
  if (char.length >= 3) {
    const c1 = char.charCodeAt(0);
    const c2 = char.charCodeAt(1);
    const c3 = char.charCodeAt(2);
    return c1 === 27 && c2 === 91 && (c3 !== 65 && c3 !== 66);
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

export class SenseCodeTerminal {
  private cacheInput: string = '';
  private cancel?: AbortController;
  private responsing: boolean = false;
  private history: string[] = [];
  private curHistoryId = -1;
  private banWords: BanWords = BanWords.getInstance();

  constructor() {
    let writeEmitter = new EventEmitter<string>();
    let un = sensecodeManager.username() || "User";
    let terminal = window.createTerminal({
      name: "SenseCode",
      isTransient: true,
      iconPath: new ThemeIcon('sensecode-icon'),
      pty: {
        onDidWrite: writeEmitter.event,
        open: () => {
          let ai = sensecodeManager.getActiveClientLabel() || "SenseCode";
          let welcomMsg = l10n.t("Welcome<b>{0}</b>, I'm <b>{1}</b>, your code assistant. You can ask me to help you with your code, or ask me any technical question.", un, ai);
          writeEmitter.fire('\x1b[1 q\x1b[1;96m' + ai + ' > \x1b[0;96m' + welcomMsg.replace(/<b>/g, '\x1b[1;96m').replace(/<\/b>/g, '\x1b[0;96m') + '\x1b[0m\r\n\r\n\x1b[1;34m' + un + " > \x1b[0m");
        },
        close: () => { },
        handleInput: (input: string) => {
          let username = sensecodeManager.username() || "User";
          let question = '';
          if (isUpKey(input)) {
            if (this.history.length > this.curHistoryId + 1) {
              this.curHistoryId++;
              this.cacheInput = this.history[this.curHistoryId];
              writeEmitter.fire("\x1b[1M\x1b[1;34m" + username + " > \x1b[0m" + this.cacheInput);
            }
            return;
          } else if (isDownKey(input)) {
            if (this.curHistoryId >= 0) {
              this.curHistoryId--;
              if (this.curHistoryId >= 0 && this.history.length > this.curHistoryId) {
                this.cacheInput = this.history[this.curHistoryId];
                writeEmitter.fire("\x1b[1M\x1b[1;34m" + username + " > \x1b[0m" + this.cacheInput);
              } else {
                writeEmitter.fire("\x1b[1M\x1b[1;34m" + username + " > \x1b[0m");
              }
            }
            return;
          } else if (isNonPrintableCharacter(input) || ignoreKeys(input)) {
            return;
          }

          this.curHistoryId = -1;

          if (input === '\r') {
            question = this.cacheInput;
            this.cacheInput = '';
            let robot = sensecodeManager.getActiveClientLabel() || "SenseCode";
            writeEmitter.fire("\r\n\x1b[1;96m" + robot + " > \x1b[0m\r\n");
            this.history = [question, ...this.history];
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
          } else if (isCtrlC(input)) {
            if (this.responsing) {
              this.cancel?.abort();
            } else {
              writeEmitter.fire('\r\n\x1b[1;34m' + username + " > \x1b[0m");
            }
            return;
          } else {
            this.cacheInput += input;
            writeEmitter.fire(input);
            return;
          }

          if (this.banWords.checkBanWords([question])) {
            writeEmitter.fire(`\r\n\x1b[1;31merror: ${l10n.t("Incomprehensible Question")}\x1b[0m\r\n`);
            writeEmitter.fire('\r\n\x1b[1;34m' + username + " > \x1b[0m");
            return;
          }

          this.cancel = new AbortController();
          this.responsing = true;

          telemetryReporter.logUsage('free chat terminal', {
            // eslint-disable-next-line @typescript-eslint/naming-convention
            'common.client': env.appName,
            // eslint-disable-next-line @typescript-eslint/naming-convention
            'common.username': username
          });
          sensecodeManager.getCompletionsStreaming(
            {
              messages: [{ role: Role.system, content: "" }, { role: Role.user, content: question }],
              n: 1,
              stop: ["<|end|>"]
            },
            (event) => {
              if (this.cancel?.signal.aborted) {
                this.responsing = false;
                writeEmitter.fire('\r\n\r\n\x1b[1;34m' + username + " > \x1b[0m");
                return;
              }
              let content: string | undefined = undefined;
              let data = event.data;
              if (data && data.choices && data.choices[0]) {
                content = data.choices[0].message.content;
              }
              switch (event.type) {
                case ResponseEvent.cancel: {
                  this.responsing = false;
                  writeEmitter.fire('\r\n\r\n\x1b[1;34m' + username + " > \x1b[0m");
                  break;
                }
                case ResponseEvent.finish:
                case ResponseEvent.data: {
                  if (content) {
                    writeEmitter.fire(content.replace(/\n/g, '\r\n'));
                  }
                  break;
                }
                case ResponseEvent.error: {
                  this.responsing = false;
                  writeEmitter.fire(`\r\n\x1b[1;31merror: ${content}\x1b[0m`);
                  writeEmitter.fire('\r\n\r\n\x1b[1;34m' + username + " > \x1b[0m");
                  break;
                }
                case ResponseEvent.done: {
                  this.responsing = false;
                  writeEmitter.fire('\r\n\r\n\x1b[1;34m' + username + " > \x1b[0m");
                  break;
                }
              }
            },
            {
              signal: this.cancel?.signal
            }
          ).catch(e => {
            this.responsing = false;
            writeEmitter.fire(`\r\n\x1b[1;31merror: ${e.message}\x1b[0m`);
            writeEmitter.fire('\r\n\r\n\x1b[1;34m' + username + " > \x1b[0m");
          });
        }
      }
    });
    terminal.show();
  }

}