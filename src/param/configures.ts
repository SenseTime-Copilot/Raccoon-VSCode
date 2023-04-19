import axios from "axios";
import { ExtensionContext, l10n, window, workspace, WorkspaceConfiguration } from "vscode";

export interface Engine {
  label: string;
  url: string;
  key: string | undefined;
  config: any;
  streamConfig?: any;
}

export interface Prompt {
  type: string;
  prompt: string;
  brush?: boolean;
  icon?: string;
}

const builtinPrompts: { [key: string]: Prompt } = {
  generation: {
    type: "code generation",
    prompt: "code generation.",
    brush: true,
    icon: "process_chart"
  },
  completion: {
    type: "code completion",
    prompt: "Please complete the following code",
    brush: true,
    icon: "gradient"
  },
  blankFilling: {
    type: "code blank filling",
    prompt: "Complete the following code, fill in the missing parts",
    brush: true,
    icon: "format_image_right"
  },
  codeCorrection: {
    type: "code error correction",
    prompt: "Identify and correct any errors in the following code snippet",
    brush: true,
    icon: "add_task"
  },
  refactoring: {
    type: "code refactoring and optimization",
    prompt: "code refactoring and optimization. Refactor the given code to improve readability, modularity, and maintainability",
    brush: true,
    icon: "construction"
  },
  addTest: {
    type: "test sample generation",
    prompt: "Generate a set of test cases and corresponding test code for the following code",
    icon: "science"
  },
  complexityAnalysis: {
    type: "code complexity analysis",
    prompt: "Analyze the space and time complexity of the provided code. Provide a brief explanation of the code and the reasoning behind the complexities",
    icon: "multiline_chart"
  },
  codeConversion: {
    type: "code language conversion",
    prompt: "Convert the given code equivalent ${input:target language} code",
    icon: "repeat"
  }
};

export class Configuration {
  private configuration: WorkspaceConfiguration;
  private context: ExtensionContext;
  constructor(context: ExtensionContext) {
    this.context = context;
    this.configuration = workspace.getConfiguration("SenseCode", undefined);
    this.update();
  }

  public update() {
    this.configuration = workspace.getConfiguration("SenseCode", undefined);
    this.activeEngine = this.context.globalState.get("engine");
  }

  public get activeEngine(): Engine | undefined {
    return this.context.globalState.get<Engine>("engine");
  }

  public set activeEngine(engine: Engine | undefined) {
    let engines = this.engines;
    if (engine) {
      let es = engines.filter((e) => {
        return e.label === engine!.label;
      });
      if (es.length === 0) {
        engine = undefined;
      } else {
        engine = es[0];
      }
    }
    if (!engine) {
      engine = engines[0];
    }
    this.context.globalState.update("engine", engine);
  }

  public get prompt(): { [key: string]: Prompt } {
    let customPrompts: { [key: string]: string } = this.configuration.get("Prompt", {});
    let prompts: { [key: string]: Prompt } = {};
    for (let label in builtinPrompts) {
      let labelPre = label.replace(/([A-Z])/g, " $1");
      labelPre = labelPre.charAt(0).toUpperCase() + labelPre.slice(1);
      prompts[l10n.t(labelPre)] = builtinPrompts[label];
    }
    for (let label in customPrompts) {
      let labelPre = label.replace(/([A-Z])/g, " $1");
      labelPre = labelPre.charAt(0).toUpperCase() + labelPre.slice(1);
      prompts[labelPre] = {
        type: "custom",
        prompt: customPrompts[label]
      };
    }
    return prompts;
  }

  public get engines(): Engine[] {
    let es = this.configuration.get<Engine[]>("Engines", []);
    if (es.length === 0) {
      let e = {
        label: "Default",
        url: "https://ams.sensecoreapi.cn/studio/ams/data/v1/completions",
        key: undefined,
        config: {
          model: "penrose-411",
          n: 1,
          // eslint-disable-next-line @typescript-eslint/naming-convention
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

  public async getApiKey(): Promise<string | undefined> {
    let token = await this.context.secrets.get("sensecode.token");
    if (!token) {
      return undefined;
    }
    return axios.get(`https://gitlab.bj.sensetime.com/api/v4/user`,
      {
        // eslint-disable-next-line @typescript-eslint/naming-convention
        headers: { "PRIVATE-TOKEN": token }
      })
      .then(
        async (res) => {
          if (res?.data?.name === "kestrel.guest") {
            return await this.context.secrets.get("sensecode.key");
          }
          return undefined;
        }
      ).catch(async (error) => {
        await this.context.secrets.delete("sensecode.key");
        await this.context.secrets.delete("sensecode.token");
        window.showErrorMessage(error.message, l10n.t("Close"));
        return undefined;
      });
  }

  public async getToken(): Promise<string | undefined> {
    return await this.context.secrets.get("sensecode.token");
  }

  public async setApiKey(token: string | undefined) {
    if (!token) {
      await this.context.secrets.delete("sensecode.key");
      await this.context.secrets.delete("sensecode.token");
    } else {
      return axios.get(`https://gitlab.bj.sensetime.com/api/v4/user`,
        {
          // eslint-disable-next-line @typescript-eslint/naming-convention
          headers: { "PRIVATE-TOKEN": token }
        })
        .then(
          async (res) => {
            if (res?.data?.name === "kestrel.guest") {
              await this.context.secrets.store("sensecode.key", "FBSCRPFSAEPP=FEASBC?QNSFRB>?==A>GBD>C=PR=C=O?CCFAQBBQOB?@>=?@D?=R");
              await this.context.secrets.store("sensecode.token", token);
            }
          }
        ).catch(async (error) => {
          await this.context.secrets.delete("sensecode.key");
          await this.context.secrets.delete("sensecode.token");
          window.showErrorMessage(error.message, l10n.t("Close"));
        });
    }
  }

  public get autoComplete(): boolean {
    return this.context.globalState.get("CompletionAutomatically", false);
  }

  public set autoComplete(v: boolean) {
    this.context.globalState.update("CompletionAutomatically", v);
  }

  public get streamResponse(): boolean {
    return this.context.globalState.get("StreamResponse", true);
  }

  public set streamResponse(v: boolean) {
    this.context.globalState.update("StreamResponse", v);
  }

  public get printOut(): boolean {
    return this.context.globalState.get("DirectPrintOut", true);
  }

  public set printOut(v: boolean) {
    this.context.globalState.update("DirectPrintOut", v);
  }

  public get delay(): number {
    return this.context.globalState.get("delay", 1);
  }

  public set delay(v: number) {
    this.context.globalState.update("delay", v);
  }
}