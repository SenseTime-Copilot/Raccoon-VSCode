import { outlog } from "../globalEnv";
import { ClientConfig } from "../raccoonClient/CodeClient";
import { ExtensionContext, Uri, workspace } from 'vscode';

const decoder = new TextDecoder();

export enum ModelCapacity {
  assistant = "assistant",
  completion = "completion",
}

export interface ClientOption {
  url: string;
  template: string;
  parameters: any;
  maxInputTokenNum: number;
  totalTokenNum: number;
}

export type RaccoonClientConfig = ClientConfig & {
  [key in ModelCapacity]?: ClientOption;
};

export class RaccoonConfig {
  protected static instance: RaccoonConfig | undefined = undefined;
  private _value: any = {};

  private constructor(private context: ExtensionContext) {
  }

  private async init() {
    let configFile = Uri.joinPath(this.context.extensionUri, "config/value.json");
    outlog.debug(`Read config from ${configFile.toString()}`);
    await workspace.fs.readFile(configFile).then((raw) => {
      this._value = JSON.parse(decoder.decode(raw));
    });
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

  public value(key: string): any {
    return this._value[key];
  }
}