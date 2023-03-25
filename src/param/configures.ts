import { workspace, env, WorkspaceConfiguration } from "vscode";
import { localeCN } from "./localeCN";
import { localeEN } from "./localeEN";

export const localeTag = env.language === "zh-cn" ? localeCN : localeEN;

export interface Engine {
  label: string;
  url: string;
  key: string | undefined;
  capacities: string[] | undefined;
  config: any;
}

export class Configuration {
  static configuration: WorkspaceConfiguration;
  constructor() {
    Configuration.update();
  }

  public static update() {
    Configuration.configuration = workspace.getConfiguration("SenseCode", undefined);
  }

  public static get next(): any {
    return Configuration.configuration.get("Next", {});
  }

  public static get prompt(): any {
    return Configuration.configuration.get("Prompt", {});
  }

  public static get engines(): Engine[] {
    let es = Configuration.configuration.get<Engine[]>("Engines", []);
    if (es.length === 0) {
      let e = {
        label: "Builtin",
        url: "https://ams.sensecoreapi.cn/studio/ams/data/v1/completions",
        capacities: [
          "completion"
        ],
        key: undefined,
        config: {
          model: "CodeGen-16B-mono",
          n: 1,
          max_tokens: 128,
          stop: "\n\n",
          temperature: 0.8
        }
      };
      workspace.getConfiguration("SenseCode").update("Engines", [e], true);
      return [e];
    } else {
      return es;
    }
  }

  public static get autoCompleteEnabled(): boolean {
    return Configuration.configuration.get("CompletionAutomatically", true);
  }

  public static get printOut(): boolean {
    return Configuration.configuration.get("DirectPrintOut", false);
  }

  public static get delay(): number {
    return Configuration.configuration.get("CompletionDelay", 0.5);
  }
}