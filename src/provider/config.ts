import { outlog } from "../globalEnv";
import { ClientConfig, RequestParam } from "../raccoonClient/CodeClient";
import { ExtensionContext, FileStat, Uri, env, workspace } from 'vscode';
import { RaccoonPrompt } from "./promptTemplates";

const decoder = new TextDecoder();

export enum ModelCapacity {
  assistant = "assistant",
  completion = "completion",
}

export interface ClientOption {
  template: string;
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

  private constructor(private context: ExtensionContext) {
  }

  private async init() {
    let configFile = Uri.joinPath(this.context.extensionUri, "config/value.json");
    outlog.debug(`Read config from ${configFile.toString()}`);
    await workspace.fs.readFile(configFile).then((raw) => {
      this._value = JSON.parse(decoder.decode(raw));
    });
    let lang = this.displayLanguage || this.context.globalState.get(`DisplayLanguage`) || env.language.toLocaleLowerCase();
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

  public get displayLanguage(): string {
    return this._value.displayLanguage;
  }

  public builtinPrompt(): RaccoonPrompt[] {
    return this._prompt;
  }
}