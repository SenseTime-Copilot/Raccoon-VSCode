import { window, commands, Position } from "vscode";

export class KeyCalculator {
  constructor() {
    commands.registerCommand("sensecode.keyCalculate", () => {
      this.calculate();
    });
  }

  async calculate() {
    let editor = window.activeTextEditor;
    if (editor) {
      let content = editor.document.getText();
      let lines = content.split("\n");
      for (let ln = 0; ln < lines.length; ln++) {
        let items = lines[ln].split(",");
        if (items.length === 5) {
          let s1 = Buffer.from(`${items[1]}#${items[0]}#${items[2]}`).toString('base64');
          let s2 = Buffer.from(`${items[3]}#${items[4]}`).toString('base64');
          s1 = s1.split("=")[0];
          s2 = s2.split("=")[0];
          let len = Math.max(s1.length, s2.length);
          let key = '';
          for (let i = 0; i < len; i++) {
            if (i < s1.length) {
              key += s1[i];
            }
            if (i === s1.length) {
              key += ',';
            }
            if (i < s2.length) {
              key += s2[i];
            }
          }
          await editor.edit((edit) => {
            edit.insert(new Position(ln, lines[ln].length), `,"${key}"`);
          });
        }
      }
    }
  }
}