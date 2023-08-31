import { l10n } from "vscode";
import { Message, Role } from "../sensecodeClient/src/CodeClient";

export enum PromptType {
  help = "help",
  codeGeneration = "code generation",
  testSampleGeneration = "test sample generation",
  codeLanguageConversion = "code language conversion",
  codeErrorCorrection = "code error correction",
  codeRefactoringOptimization = "code refactoring and optimization",
  freeChat = "free chat",
  customPrompt = "custom"
}

export interface SenseCodePrompt {
  label: string;
  type: PromptType;
  message: Message;
  shortcut?: string;
  code?: string;
  languageid?: string;
  args?: any;
  brush?: boolean;
  icon?: string;
}

export enum RenderStatus {
  resolved = "resolved",
  editRequired = "editRequired",
  codeMissing = "codeMissing"
}

export interface SenseCodePromptHtml {
  status: RenderStatus;
  html: string;
  prompt: SenseCodePrompt;
}

export class PromptInfo {
  private _prompt: SenseCodePrompt;
  constructor(prompt: SenseCodePrompt) {
    this._prompt = prompt;
  }

  public generatePromptHtml(id: number, argValues?: any): SenseCodePromptHtml {
    if (this._prompt.message.content.includes("{code}") && !this._prompt.code) {
      return {
        status: RenderStatus.codeMissing,
        html: "",
        prompt: this._prompt
      };
    }
    if (!this._prompt.message.content.includes("{code}")) {
      this._prompt.code = undefined;
      this._prompt.languageid = undefined;
    }
    let renderHtml: SenseCodePromptHtml = {
      status: RenderStatus.resolved,
      html: "",
      prompt: this._prompt
    };

    let prompt = this._prompt;
    if (argValues) {
      for (let argName in argValues) {
        let arg = argValues[argName];
        if (argValues && argValues[argName] !== undefined) {
          prompt.message.content = prompt.message.content.replace(`{${argName}}`, arg);
        }
      }
    }

    let args = this._prompt.args;
    let prompthtml = prompt.message.content;
    prompthtml = prompthtml.replace(/</g, "&lt;");
    let argData = '';
    if (args && Object.keys(args).length > 0) {
      renderHtml.status = RenderStatus.editRequired;
      for (let argName in args) {
        let arg = args[argName];
        switch (arg.type) {
          case "enum": {
            let renderElem = `<div class="inline-flex items-center gap-1 mx-1"><select class="ignoreText" id="${argName}-${id}" onChange="document.getElementById('values-${id}').dataset.${argName} = this.options[this.selectedIndex].text;">`;
            for (let v of arg.options) {
              renderElem += `<option value="${v}">${v}</option>`;
            }
            renderElem += "</select></div>";
            prompthtml = prompthtml.replace(`{${argName}}`, renderElem);
            argData += `data-${argName}="${arg.options[0]}" `;
            break;
          }
          case "button":
          case "file":
          case "image":
          case "radio":
          case "reset":
          case "submit": {
            break;
          }
          default: {
            if (!arg.type) {
              break;
            }
            let initialValue;
            if (arg.type === "color") {
              initialValue = "#000000";
            } else if (arg.type === "range") {
              let max = arg.max || 100;
              let min = arg.min || 0;
              initialValue = (max + min) / 2;
              if (max < min) {
                initialValue = min;
              }
            } else {
              initialValue = "";
            }
            argData += `data-${argName}="${initialValue}" `;
            let properties = '';
            for (let argkey in arg) {
              properties += `${argkey}="${arg[argkey]}" `;
            }
            let renderElem = `<div class="inline-flex items-center gap-1 mx-1"><input class="ignoreText" id="${argName}-${id}" ${properties} onChange="document.getElementById('values-${id}').dataset.${argName} = this.value;"/></div>`;
            prompthtml = prompthtml.replace(`{${argName}}`, renderElem);
            break;
          }
        }
      }
    }

    let codeHtml = "";
    if (renderHtml.prompt.code) {
      let langclass = renderHtml.prompt.languageid ? `language-${renderHtml.prompt.languageid}` : ``;
      let langdata = renderHtml.prompt.languageid ? `data-lang="${renderHtml.prompt.languageid}"` : "";
      let codelines = renderHtml.prompt.code.split('\n').length;
      let btn1 = '<button class="unfold-btn expend-code rounded"><span class="material-symbols-rounded">expand</span></button>';
      let btn2 = '<button class="fold-btn expend-code rounded hidden"><span class="material-symbols-rounded">compress</span></button>';
      let btns = `${btn1}${btn2}`;
      let safeCode = renderHtml.prompt.code.replace(/</g, "&lt;");
      codeHtml = `<pre ${langdata} class="pre-code-element flex flex-col ${codelines > 10 ? "fold" : ""}" style="margin-top: 1rem;"><div class="code-actions-wrapper"><button title="${l10n.t("Toggle line wrap")}" class="wrap-element-gnc rounded"><span class="material-symbols-rounded">wrap_text</span></button>${codelines > 10 ? btns : ""}</div><code ${langdata} class="${langclass}">${safeCode}</code></pre>`;
    }
    prompthtml = prompthtml.replace("{code}", codeHtml);
    if (prompt.type === PromptType.freeChat || prompt.type === PromptType.customPrompt) {
    } else {
      prompthtml = prompthtml.replace(`${l10n.t("Please provide an explanation at the end")}.`, "");
      prompthtml = `<p class="instruction-label">${renderHtml.prompt.label.replace("...", "")}</p>` + prompthtml;
    }

    if (renderHtml.status === RenderStatus.editRequired) {
      renderHtml.html =
        `<div id="prompt-${id}" class="prompt markdown-body mt-4 leading-loose w-full editing"  data-label="${this.label}" data-type="${this.type}" data-prompt="${prompt.message.content}">${prompthtml.trim()}<div id="values-${id}" class="values hidden" ${argData}><div class="languageid-value">${prompt.languageid || ""}</div><div class="code-value">${prompt.code || ""}</div></div></div>`;
    } else {
      renderHtml.html =
        `<div id="prompt-${id}" class="prompt markdown-body mt-4 leading-loose w-full"  data-label="${this.label}" data-type="${this.type}" data-prompt="${prompt.message.content}">${prompthtml.trim()}<div id="values-${id}" class="values hidden"><div class="languageid-value">${prompt.languageid || ""}</div><div class="code-value">${prompt.code || ""}</div></div></div>`;
    }

    return renderHtml;
  }

  public get type(): PromptType {
    return this._prompt.type;
  }

  public get label(): string {
    return this._prompt.label;
  }

  public get prompt(): Message {
    return this._prompt.message;
  }

  public get codeInfo(): { code: string; languageid: string } | undefined {
    if (this._prompt.code) {
      return {
        code: this._prompt.code,
        languageid: this._prompt.languageid || ""
      };
    }
  }

  public set codeInfo(info: { code: string; languageid: string } | undefined) {
    if (info) {
      this._prompt.code = info.code;
      this._prompt.languageid = info.languageid;
    }
  }
}

export const builtinPrompts: SenseCodePrompt[] = [
  /*
  {
    label: l10n.t("Help"),
    type: PromptType.help,
    shortcut: "help",
    message: {
      role: Role.function,
      content: 'Show help information'
    },
    icon: "help"
  },
  */
  {
    label: l10n.t("Generation"),
    type: PromptType.codeGeneration,
    //shortcut: "generate",
    message: {
      role: Role.user,
      content: `{code}`
    },
    brush: true,
    icon: "gradient"
  },
  {
    label: l10n.t("Add Test"),
    type: PromptType.testSampleGeneration,
    //shortcut: "test",
    message: {
      role: Role.user,
      content: `{code}`
    },
    icon: "science"
  },
  {
    label: l10n.t("Code Conversion"),
    type: PromptType.codeLanguageConversion,
    //shortcut: "translate",
    message: {
      role: Role.user,
      content: `${l10n.t("Convert the given code to equivalent {0} code", "{language}")}.\n{code}`
    },
    args: {
      language: {
        type: "enum",
        options: [
          "C",
          "C++",
          "C#",
          "Go",
          "Java",
          "JavaScript",
          "Lua",
          "Objective-C",
          "PHP",
          "Perl",
          "Python",
          "R",
          "Ruby",
          "Rust",
          "Swift",
          "TypeScript"
        ]
      }
    },
    icon: "repeat"
  },
  {
    label: l10n.t("Code Correction"),
    type: PromptType.codeErrorCorrection,
    //shortcut: "fix",
    message: {
      role: Role.user,
      content: `{code}`
    },
    brush: true,
    icon: "add_task"
  },
  {
    label: l10n.t("Refactoring"),
    type: PromptType.codeRefactoringOptimization,
    //shortcut: "refactor",
    message: {
      role: Role.user,
      content: `{code}`
    },
    brush: true,
    icon: "construction"
  }
];
