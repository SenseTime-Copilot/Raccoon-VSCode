import { l10n } from "vscode";
import { Prompt } from "../sensecodeClient/src";

export enum PromptType {
  codeCompletion = "code completion",
  codeGeneration = "code generation",
  testSampleGeneration = "test sample generation",
  codeLanguageConversion = "code language conversion",
  codeErrorCorrection = "code error correction",
  codeRefactoringOptimization = "code refactoring and optimization",
  freeChat = "free chat",
  customPrompt = "custom"
}

interface SenseCodePrompt extends Prompt {
  label: string;
  type: PromptType;
  args?: any;
  brush?: boolean;
  icon?: string;
}

export class PromptInfo {
  private _prompt: SenseCodePrompt;
  private _editRequired: boolean = false;
  private _codeRequired: boolean = false;
  constructor(prompt: SenseCodePrompt, args?: any) {
    let allArgs = { ...prompt.args, ...args };
    this._prompt = this.generatePrompt(prompt, allArgs);
  }

  private generatePrompt(prompt: SenseCodePrompt, args: any): SenseCodePrompt {
    this._prompt = prompt;
    if (this._prompt.prompt.includes('{input') || this._prompt.suffix.includes('{input')) {
      this._prompt.label += "...";
      this._editRequired = true;
    }
    if (this._prompt.prompt.includes("{code}") || this._prompt.suffix.includes("{code}")) {
      this._codeRequired = true;
    }
    return prompt;
  }

  public get type(): PromptType {
    return this._prompt.type;
  }

  public get editRequired(): boolean {
    return this._editRequired;
  }

  public get codeRequired(): boolean {
    return this._codeRequired;
  }

  public get label(): string {
    return this._prompt.label;
  }

  public get prompt(): Prompt {
    return this._prompt;
  }
}

export const builtinPrompts: PromptInfo[] = [
  new PromptInfo({
    label: l10n.t("Generation"),
    type: PromptType.codeGeneration,
    prologue: `Below is an instruction that describes a task. Write a response that appropriately completes the request.

### Instruction:
Task type: `,
    prompt: `${PromptType.codeGeneration}

### Input:

\`\`\`{codeLang}
{code}
\`\`\`

`,
    suffix: "### Response:\n",
    brush: true,
    icon: "process_chart"
  }),
  new PromptInfo({
    label: l10n.t("Add Test"),
    type: PromptType.testSampleGeneration,
    prologue: `Below is an instruction that describes a task. Write a response that appropriately completes the request.

### Instruction:
Task type: `,
    prompt: `${PromptType.testSampleGeneration}. Generate a set of test cases and corresponding test code for the following code

### Input:

\`\`\`{codeLang}
{code}
\`\`\`

`,
    suffix: "### Response:\n",
    icon: "science"
  }),
  new PromptInfo({
    label: l10n.t("Code Conversion"),
    type: PromptType.codeLanguageConversion,
    prologue: `Below is an instruction that describes a task. Write a response that appropriately completes the request.

### Instruction:
Task type: `,
    prompt: `${PromptType.codeLanguageConversion}. Convert the given code to equivalent {input:$language} code

### Input:

\`\`\`{codeLang}
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
  }),
  new PromptInfo({
    label: l10n.t("Code Correction"),
    type: PromptType.codeErrorCorrection,
    prologue: `Below is an instruction that describes a task. Write a response that appropriately completes the request.

### Instruction:
Task type: `,
    prompt: `${PromptType.codeErrorCorrection}. Identify and correct any errors in the following code snippet

### Input:

\`\`\`{codeLang}
{code}
\`\`\`

`,
    suffix: "### Response:\n",
    brush: true,
    icon: "add_task"
  }),
  new PromptInfo({
    label: l10n.t("Refactoring"),
    type: PromptType.codeRefactoringOptimization,
    prologue: `Below is an instruction that describes a task. Write a response that appropriately completes the request.

### Instruction:
Task type: `,
    prompt: `${PromptType.codeRefactoringOptimization}. Refactor the given code to improve readability, modularity, and maintainability

### Input:

\`\`\`{codeLang}
{code}
\`\`\`

`,
    suffix: "### Response:\n",
    brush: true,
    icon: "construction"
  })
];
