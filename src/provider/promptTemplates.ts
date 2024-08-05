import { raccoonConfig } from "../globalEnv";
import { Message, Role } from "../raccoonClient/CodeClient";
import { RaccoonAgent } from "./agentManager";

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

export interface RaccoonPrompt {
  label: string;
  type: PromptType;
  systemPrompt?: string;
  message: Message;
  shortcut: string;
  origin?: string;
  inputRequired?: boolean;
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

export interface RaccoonPromptHtml {
  status: RenderStatus;
  html: string;
  prompt: RaccoonPrompt;
}

export class PromptInfo {
  private _prompt: RaccoonPrompt;
  private _agent?: RaccoonAgent;
  constructor(prompt: RaccoonPrompt, agent?: RaccoonAgent) {
    this._prompt = prompt;
    this._agent = agent;
  }

  public generatePromptHtml(id: number, argValues?: any): RaccoonPromptHtml {
    if (this._prompt.message.content.includes("{{code}}") && !this._prompt.code) {
      return {
        status: RenderStatus.codeMissing,
        html: "",
        prompt: this._prompt
      };
    }
    if (!this._prompt.message.content.includes("{{code}}")) {
      this._prompt.code = undefined;
      this._prompt.languageid = undefined;
    }
    let renderHtml: RaccoonPromptHtml = {
      status: RenderStatus.resolved,
      html: "",
      prompt: this._prompt
    };

    let prompt = this._prompt;
    if (argValues) {
      for (let argName in argValues) {
        let arg = argValues[argName];
        if (argValues && argValues[argName] !== undefined) {
          prompt.message.content = prompt.message.content.replace(`{{${argName}}}`, arg);
        }
      }
    }

    let args = this._prompt.args;
    let prompthtml = prompt.message.content;
    prompthtml = prompthtml.replace(/</g, "&lt;").replace(/>/g, "&gt;");
    let argData = '';
    if (args && Object.keys(args).length > 0) {
      renderHtml.status = RenderStatus.editRequired;
      for (let argName in args) {
        let arg = args[argName];
        switch (arg.type) {
          case "enum": {
            let renderElem = `<div class="inline-flex items-center gap-1 mx-1"><select class="ignoreText" id="${argName}-${id}" onChange="document.getElementById('values-${id}').dataset.${argName} = this.value;">`;
            for (let v of arg.options) {
              renderElem += `<option value="${v}">${v}</option>`;
            }
            renderElem += "</select></div>";
            prompthtml = prompthtml.replace(`{{${argName}}}`, renderElem);
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
              if (arg[argkey]) {
                properties += `${argkey}="${arg[argkey]}" `;
              }
            }
            let renderElem = `<div class="inline-flex items-center gap-1 mx-1"><input class="ignoreText" id="${argName}-${id}" ${properties} onChange="document.getElementById('values-${id}').dataset.${argName} = this.value;"/></div>`;
            prompthtml = prompthtml.replace(`{{${argName}}}`, renderElem);
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
      let btnView = '';
      let btn1 = '';
      let btn2 = '';
      let classList = 'pre-code-element flex flex-col';
      if (langclass === 'language-mermaid') {
        btnView = '<button class="mermaid-element-gnc rounded"><span class="material-symbols-rounded">visibility</span></button>';
      }
      if (codelines > 10) {
        classList += " fold";
        btn1 = '<button class="unfold-btn expend-code rounded"><span class="material-symbols-rounded">expand</span></button>';
        btn2 = '<button class="fold-btn expend-code rounded hidden"><span class="material-symbols-rounded">compress</span></button>';
      }
      let btns = `${btnView}${btn1}${btn2}`;
      let safeCode = renderHtml.prompt.code.replace(/</g, "&lt;").replace(/>/g, "&gt;");
      codeHtml = `<pre ${langdata} class="${classList}" style="margin-top: 1rem;"><div class="code-actions-wrapper"><button title="${raccoonConfig.t("Toggle line wrap")}" class="wrap-element-gnc rounded" tabindex="-1"><span class="material-symbols-rounded">wrap_text</span></button>${codelines > 10 ? btns : ""}</div><code ${langdata} class="${langclass}">${safeCode}</code></pre>`;
    }
    prompthtml = prompthtml.replace(/\{\{code\}\}/g, codeHtml);
    if (prompt.type === PromptType.freeChat || prompt.type === PromptType.customPrompt) {
    } else {
      prompthtml = `<p class="instruction-label font-bold pl-1 pr-2"><span class="material-symbols-rounded align-text-bottom">auto_fix_normal</span>${renderHtml.prompt.label.replace("...", "")}</p>` + prompthtml;
    }

    if (this._agent) {
      prompthtml = `<p class="instruction-label font-bold pl-1 pr-2" title="${this._agent.label}">@${this._agent.id}</p>` + prompthtml;
    }

    if (renderHtml.status === RenderStatus.editRequired) {
      renderHtml.html =
        `<div id="prompt-${id}" class="prompt markdown-body pb-2 editing" data-id="${id}" data-label="${this.label}">${prompthtml.trim()}<div id="values-${id}" class="values hidden" ${argData}></div></div>`;
    } else {
      renderHtml.html =
        `<div id="prompt-${id}" class="prompt markdown-body pb-2" data-id="${id}" data-label="${this.label}">${prompthtml.trim()}<div id="values-${id}" class="values hidden"></div></div>`;
    }

    return renderHtml;
  }

  public get type(): PromptType {
    return this._prompt.type;
  }

  public get label(): string {
    return this._prompt.label;
  }

  public get systemPrompt(): Message | undefined {
    let defaultSystemPrompt = raccoonConfig.systemPrompt;
    if (this._agent) {
      if (this._agent.systemPrompt) {
        return {
          role: Role.system,
          content: this._agent?.systemPrompt
        };
      }
    } else if (defaultSystemPrompt) {
      return {
        role: Role.system,
        content: raccoonConfig.systemPrompt
      };
    }
  }

  public get userPrompt(): Message {
    return this._prompt.message;
  }

  public get agent(): RaccoonAgent | undefined {
    return this._agent;
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
