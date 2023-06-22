import { l10n } from "vscode";
import { Prompt } from "../sensecodeClient/src";

export enum PromptType {
  none,
  codeCompletion = "code completion",
  codeGeneration = "code generation",
  testSampleGeneration = "test sample generation",
  codeLanguageConversion = "code language conversion",
  codeErrorCorrection = "code error correction",
  codeRefactoringOptimization = "code refactoring and optimization",
  freeChat = "free chat",
  customPrompt = "custom"
}

export interface SenseCodePrompt extends Prompt {
  label: string;
  type: PromptType;
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
  type: PromptType;
  html: string;
  code?: string;
  languageid?: string;
}

export class PromptInfo {
  private _prompt: SenseCodePrompt;
  constructor(prompt: SenseCodePrompt) {
    this._prompt = prompt;
  }

  public generatePromptHtml(id: number, argValues?: any): SenseCodePromptHtml {
    if (this._prompt.prompt.includes("{code}") && !this._prompt.code) {
      return {
        status: RenderStatus.codeMissing,
        type: this.type,
        html: ""
      }
    }
    if (!this._prompt.prompt.includes("{code}")) {
      this._prompt.code = undefined;
      this._prompt.languageid = undefined;
    }
    let renderHtml: SenseCodePromptHtml = {
      status: RenderStatus.resolved,
      type: this.type,
      html: "",
      code: this._prompt.code,
      languageid: this._prompt.languageid
    };

    let prompt = this._prompt;
    if (argValues) {
      for (let argName in argValues) {
        let arg = argValues[argName];
        if (argValues && argValues[argName]) {
          prompt.prompt = prompt.prompt.replace(`{${argName}}`, arg);
        }
      }
    }

    let args = this._prompt.args;
    let prompthtml = prompt.prompt;
    let argData = '';
    if (args) {
      renderHtml.status = RenderStatus.editRequired;
      for (let argName in args) {
        let arg = args[argName];
        switch (arg.type) {
          case "enum": {
            let renderElem = `<div class="inline-flex items-center gap-1 mx-1"><select class="ignoreText" id="${argName}-${id}" onChange="document.getElementById('template-${id}').dataset.${argName} = this.options[this.selectedIndex].text;">`;
            for (let v of arg.options) {
              renderElem += `<option value="${v}">${v}</option>`;
            }
            renderElem += "</select></div>";
            prompthtml = prompthtml.replace(`{${argName}}`, renderElem);
            argData += `data-${argName}="${arg.options[0]}" `
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
              argData += `data-${argName}="${initialValue}" `
            } else if (arg.type === "range") {
              let max = arg.max || 100;
              let min = arg.min || 0;
              initialValue = (max + min) / 2;
              if (max < min) {
                initialValue = min;
              }
              argData += `data-${argName}="${initialValue}" `
            } else {
              initialValue = "";
            }
            let properties = '';
            for (let argkey in arg) {
              properties += `${argkey}="${arg[argkey]}" `;
            }
            let renderElem = `<div class="inline-flex items-center gap-1 mx-1"><input class="ignoreText" id="${argName}-${id}" ${properties} onChange="document.getElementById('template-${id}').dataset.${argName} = this.value;"/>`;
            prompthtml = prompthtml.replace(`{${argName}}`, renderElem);
            break;
          }
        }
      }
    }

    if (renderHtml.status === RenderStatus.editRequired) {
      renderHtml.html =
        `<div id="prompt-${id}" class="prompt inline-block leading-loose py-2 w-full editing"  data-label="${this.label}" data-type="${this.type}" data-code="${prompt.code}"  data-languageid="${prompt.languageid}"  data-prologue="${prompt.prologue}" data-prompt="${prompt.prompt}" data-suffix="${prompt.suffix}">${prompthtml.trim()}
          <div id="template-${id}" class="values hidden" ${argData}></div>
        </div>`;
    } else {
      renderHtml.html =
        `<div id="prompt-${id}" class="prompt inline-block leading-loose py-2 w-full"  data-label="${this.label}" data-type="${this.type}" data-code="${prompt.code}"  data-languageid="${prompt.languageid}"  data-prologue="${prompt.prologue}" data-prompt="${prompt.prompt}" data-suffix="${prompt.suffix}">${prompthtml.trim()}
        </div>`;
    }

    return renderHtml;
  }

  public get type(): PromptType {
    return this._prompt.type;
  }

  public get label(): string {
    return this._prompt.label;
  }

  public get prompt(): Prompt {
    return this._prompt;
  }

  public get codeInfo(): { code: string, languageid: string } | undefined {
    if (this._prompt.code) {
      return {
        code: this._prompt.code,
        languageid: this._prompt.languageid || ""
      }
    }
  }

  public set codeInfo(info: { code: string, languageid: string } | undefined) {
    if (info) {
      this._prompt.code = info.code;
      this._prompt.languageid = info.languageid;
    }
  }
}

export const builtinPrompts: SenseCodePrompt[] = [
  {
    label: l10n.t("Generation"),
    type: PromptType.codeGeneration,
    prologue: `Below is an instruction that describes a task. Write a response that appropriately completes the request.

### Instruction:
Task type: ${PromptType.codeGeneration}.`,
    prompt: `


### Input:

\`\`\`{languageid}
{code}
\`\`\`

`,
    suffix: "### Response:\n",
    brush: true,
    icon: "process_chart"
  },
  {
    label: l10n.t("Add Test"),
    type: PromptType.testSampleGeneration,
    prologue: `Below is an instruction that describes a task. Write a response that appropriately completes the request.

### Instruction:
Task type: ${PromptType.testSampleGeneration}. `,
    prompt: `Generate a set of test cases and corresponding test code for the following code

### Input:

\`\`\`{languageid}
{code}
\`\`\`

`,
    suffix: "### Response:\n",
    icon: "science"
  },
  {
    label: l10n.t("Code Conversion"),
    type: PromptType.codeLanguageConversion,
    prologue: `Below is an instruction that describes a task. Write a response that appropriately completes the request.

### Instruction:
Task type: ${PromptType.codeLanguageConversion}. `,
    prompt: `Convert the given code to equivalent {language} code

### Input:

\`\`\`{languageid}
{code}
\`\`\`

`,
    suffix: "### Response:\n",
    args: {
      language: {
        type: "enum",
        options: [
          "C",
          "C++",
          "CUDA C++",
          "C#",
          "Go",
          "Java",
          "JavaScript",
          "Lua",
          "Object-C++",
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
    prologue: `Below is an instruction that describes a task. Write a response that appropriately completes the request.

### Instruction:
Task type: ${PromptType.codeErrorCorrection}. `,
    prompt: `Identify and correct any errors in the following code snippet

### Input:

\`\`\`{languageid}
{code}
\`\`\`

`,
    suffix: "### Response:\n",
    brush: true,
    icon: "add_task"
  },
  {
    label: l10n.t("Refactoring"),
    type: PromptType.codeRefactoringOptimization,
    prologue: `Below is an instruction that describes a task. Write a response that appropriately completes the request.

### Instruction:
Task type: ${PromptType.codeRefactoringOptimization}. `,
    prompt: `Refactor the given code to improve readability, modularity, and maintainability

### Input:

\`\`\`{languageid}
{code}
\`\`\`

`,
    suffix: "### Response:\n",
    brush: true,
    icon: "construction"
  }
];
