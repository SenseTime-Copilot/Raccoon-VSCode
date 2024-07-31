import { outlog } from "../globalEnv";
import { ClientConfig, RequestParam } from "../raccoonClient/CodeClient";
import { ExtensionContext, FileStat, Uri, env, workspace } from 'vscode';
import { RaccoonPrompt } from "./promptTemplates";

import hbs = require("handlebars");
const decoder = new TextDecoder();

export enum ModelCapacity {
  assistant = "assistant",
  completion = "completion",
}

export interface ClientOption {
  parameters: RequestParam;
  maxInputTokenNum: number;
  totalTokenNum: number;
}

export type RaccoonClientConfig =
  ClientConfig
  & {
    apiType: "Raccoon" | "TGI";
  }
  & {
    [key in ModelCapacity]?: ClientOption;
  };

export class RaccoonConfig {
  protected static instance: RaccoonConfig | undefined = undefined;
  private _value: any = {};
  private _prompt: RaccoonPrompt[] = [];
  private _uiText: { [key: string]: string } = {};
  private _commitTemplate: string = "";

  private constructor(private context: ExtensionContext) {
  }

  private async init() {
    let configFile = Uri.joinPath(this.context.extensionUri, "config/value.json");
    outlog.debug(`Read config from ${configFile.toString()}`);
    await workspace.fs.readFile(configFile).then((raw) => {
      this._value = JSON.parse(decoder.decode(raw));
    });
    let lang = this.context.globalState.get<string>(`DisplayLanguage`) || env.language.toLocaleLowerCase();
    await this.loadUITextData(lang);
    await this.loadCommitTemplate(lang);
    await this.loadPromptData(lang);
  }

  private async loadUITextData(lang: string) {
    let uiTextFile = Uri.joinPath(this.context.extensionUri, `config/ui.${lang}.json`);
    let stat: FileStat | undefined;
    try {
      stat = await workspace.fs.stat(uiTextFile);
    } catch (e) {
    };
    if (stat) {
      outlog.debug(`Read UI text from ${uiTextFile.toString()}`);
    } else {
      uiTextFile = Uri.joinPath(this.context.extensionUri, `config/ui.en.json`);
      try {
        stat = await workspace.fs.stat(uiTextFile);
      } catch (e) {
      };
      if (stat) {
        outlog.debug(`Read UI text from ${uiTextFile.toString()}`);
      } else {
        outlog.debug(`No UI text file`);
      }
    }
    if (stat) {
      await workspace.fs.readFile(uiTextFile).then((raw) => {
        this._uiText = JSON.parse(decoder.decode(raw));
      });
    }
  }

  private async loadCommitTemplate(lang: string) {
    let commitTemplateFile = Uri.joinPath(this.context.extensionUri, `config/commit.${lang}.template`);
    let stat: FileStat | undefined;
    try {
      stat = await workspace.fs.stat(commitTemplateFile);
    } catch (e) {
    };
    if (stat) {
      outlog.debug(`Read Commit Template from ${commitTemplateFile.toString()}`);
    } else {
      commitTemplateFile = Uri.joinPath(this.context.extensionUri, `config/commit.en.template`);
      try {
        stat = await workspace.fs.stat(commitTemplateFile);
      } catch (e) {
      };
      if (stat) {
        outlog.debug(`Read Commit Template from ${commitTemplateFile.toString()}`);
      } else {
        outlog.debug(`No Commit Template file`);
      }
    }
    if (stat) {
      await workspace.fs.readFile(commitTemplateFile).then((raw) => {
        this._commitTemplate = decoder.decode(raw);
      });
    }
  }

  private async loadPromptData(lang: string) {
    let promptFile = Uri.joinPath(this.context.extensionUri, `config/prompt.${lang}.json`);
    let stat: FileStat | undefined;
    try {
      stat = await workspace.fs.stat(promptFile);
    } catch (e) {
    };
    if (stat) {
      outlog.debug(`Read prompt from ${promptFile.toString()}`);
    } else {
      promptFile = Uri.joinPath(this.context.extensionUri, `config/prompt.en.json`);
      try {
        stat = await workspace.fs.stat(promptFile);
      } catch (e) {
      };
      if (stat) {
        outlog.debug(`Read prompt from ${promptFile.toString()}`);
      } else {
        outlog.debug(`No prompt file`);
      }
    }
    if (stat) {
      await workspace.fs.readFile(promptFile).then((raw) => {
        this._prompt = JSON.parse(decoder.decode(raw));
      });
    }
  }

  public static async getInstance(context: ExtensionContext): Promise<RaccoonConfig> {
    if (!RaccoonConfig.instance) {
      RaccoonConfig.instance = new RaccoonConfig(context);
      await RaccoonConfig.instance.init();
    }
    return RaccoonConfig.instance;
  }

  public get builtinEngines(): RaccoonClientConfig[] {
    return this._value.engines || [];
  }

  public get type(): string {
    return this._value.type;
  }

  public get experimentalFeatures(): Array<string> {
    return this._value.experimentalFeatures || [];
  }

  public t(text: string, args?: any): string {
    let template = this._uiText[text];
    if (!template) {
      console.log("No l10n text for " + text);
      return text;
    }
    if (!args) {
      return template;
    } else {
      return hbs.compile(template, { noEscape: true })(args);
    }
  }

  public commitTemplate(args: { changes: string }): string {
    return hbs.compile(this._commitTemplate, { noEscape: true })(args);
  }

  public builtinPrompt(): ReadonlyArray<RaccoonPrompt> {
    return this._prompt;
  }
}