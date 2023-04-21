import axios from "axios";
import { ExtensionContext, l10n, window, workspace, WorkspaceConfiguration } from "vscode";

export interface Engine {
  label: string;
  url: string;
  config: any;
  key?: string;
  streamConfig?: any;
  validate?: boolean;
}

interface AuthInfo {
  id: number;
  name?: string;
  token?: string;
}

function parseAuthInfo(info: string): AuthInfo {
  let p = Buffer.from(info, "base64").toString().split("#");
  return {
    id: parseInt(p[0]),
    name: p[1],
    token: p[2]
  };
}

const builtinEngines: Engine[] = [
  {
    label: "Penrose",
    url: "https://ams.sensecoreapi.cn/studio/ams/data/v1/completions",
    config: {
      model: "penrose-411",
      n: 1,
      // eslint-disable-next-line @typescript-eslint/naming-convention
      max_tokens: 128,
      stop: "\n\n",
      temperature: 0.8
    },
    validate: true
  }
];

export interface Prompt {
  type: string;
  prompt: string;
  brush?: boolean;
  icon?: string;
}

const builtinPrompts: { [key: string]: Prompt } = {
  // eslint-disable-next-line @typescript-eslint/naming-convention
  "Generation": {
    type: "code generation",
    prompt: "code generation",
    brush: true,
    icon: "process_chart"
  },
  // eslint-disable-next-line @typescript-eslint/naming-convention
  "Completion": {
    type: "code completion",
    prompt: "Please complete the following code",
    brush: true,
    icon: "gradient"
  },
  // eslint-disable-next-line @typescript-eslint/naming-convention
  "Blank Filling": {
    type: "code blank filling",
    prompt: "Complete the following code, fill in the missing parts",
    brush: true,
    icon: "format_image_right"
  },
  // eslint-disable-next-line @typescript-eslint/naming-convention
  "Code Correction": {
    type: "code error correction",
    prompt: "Identify and correct any errors in the following code snippet",
    brush: true,
    icon: "add_task"
  },
  // eslint-disable-next-line @typescript-eslint/naming-convention
  "Refactoring": {
    type: "code refactoring and optimization",
    prompt: "Refactor the given code to improve readability, modularity, and maintainability",
    brush: true,
    icon: "construction"
  },
  // eslint-disable-next-line @typescript-eslint/naming-convention
  "Add Test": {
    type: "test sample generation",
    prompt: "Generate a set of test cases and corresponding test code for the following code",
    icon: "science"
  },
  // eslint-disable-next-line @typescript-eslint/naming-convention
  "Complexity Analysis": {
    type: "code complexity analysis",
    prompt: "Analyze the space and time complexity of the provided code. Provide a brief explanation of the code and the reasoning behind the complexities",
    icon: "multiline_chart"
  },
  // eslint-disable-next-line @typescript-eslint/naming-convention
  "Code Conversion": {
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
    let lastVersion = this.context.globalState.get<string>("lastVersion");
    if (!lastVersion) {
      this.clear();
      this.context.globalState.update("lastVersion", context.extension.packageJSON.version);
    }
    this.update();
  }

  public clear() {
    this.context.globalState.update("engine", undefined);
    this.context.globalState.update("CompletionAutomatically", undefined);
    this.context.globalState.update("StreamResponse", undefined);
    this.context.globalState.update("Candidates", undefined);
    this.context.globalState.update("DirectPrintOut", undefined);
    this.context.globalState.update("delay", undefined);
    this.configuration.update("Engines", undefined, true);
    this.configuration.update("Prompt", undefined, true);
    this.context.secrets.delete("sensecode.token");
  }

  public update() {
    this.configuration = workspace.getConfiguration("SenseCode", undefined);
    this.activeEngine = this.context.globalState.get("engine");
  }

  public get activeEngine(): Engine | undefined {
    let ae = this.context.globalState.get<Engine>("engine");
    if (!ae) {
      this.activeEngine = this.engines[0];
      return this.activeEngine;
    }
    return ae;
  }

  public set activeEngine(engine: Engine | undefined) {
    let engines = this.engines;
    if (engine) {
      let es = engines.filter((e) => {
        return e.label === engine!.label;
      });
      engine = es[0];
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
      prompts[l10n.t(label)] = builtinPrompts[label];
    }
    for (let label in customPrompts) {
      prompts[label] = { type: "custom", prompt: customPrompts[label] };
    }
    return prompts;
  }

  public get engines(): Engine[] {
    let es = this.configuration.get<Engine[]>("Engines", []);
    return builtinEngines.concat(es);
  }

  public async username(engine: Engine): Promise<string | undefined> {
    let token = await this.getApiKey(engine);
    if (!token || !engine.validate) {
      return;
    }
    let info = parseAuthInfo(token);
    return info.name;
  }

  public async avatar(engine: Engine): Promise<string | undefined> {
    let token = await this.getApiKey(engine);
    if (!token || !engine.validate) {
      return;
    }
    let info = parseAuthInfo(token);
    return axios.get(`https://gitlab.bj.sensetime.com/api/v4/users?username=${info.name}`,
      {
        // eslint-disable-next-line @typescript-eslint/naming-convention
        headers: { "PRIVATE-TOKEN": info.token || "" }
      })
      .then(
        async (res) => {
          if (res && res.data && res.data[0]) {
            return res.data[0].avatar_url;
          }
        }
      ).catch(async (_error) => {
      });
  }

  public async getApiKeyRaw(engine: Engine): Promise<string | undefined> {
    let token = await this.getApiKey(engine);
    if (!token) {
      return undefined;
    }
    if (!engine.validate) {
      return token;
    }
    let info = parseAuthInfo(token);
    return axios.get(`https://gitlab.bj.sensetime.com/api/v4/user`,
      {
        // eslint-disable-next-line @typescript-eslint/naming-convention
        headers: { "PRIVATE-TOKEN": info.token || "" }
      })
      .then(
        async (res) => {
          if (res?.data?.name === "kestrel.guest") {
            return "FBSCRPFSAEPP=FEASBC?QNSFRB>?==A>GBD>C=PR=C=O?CCFAQBBQOB?@>=?@D?=R";
          }
          window.showErrorMessage("Invalid API Key", l10n.t("Close"));
          return undefined;
        }
      ).catch(async (error) => {
        window.showErrorMessage(error.message, l10n.t("Close"));
        return undefined;
      });
  }

  public async getApiKey(engine: Engine): Promise<string | undefined> {
    let value = await this.context.secrets.get("sensecode.token");
    if (value) {
      let tokens = JSON.parse(value);
      return tokens[engine.label];
    }
  }

  public async setApiKey(engine: Engine | undefined, token: string | undefined) {
    if (!engine) {
      return;
    }
    if (!token) {
      let value = await this.context.secrets.get("sensecode.token");
      if (value) {
        let tokens = JSON.parse(value);
        delete tokens[engine.label];
        await this.context.secrets.store("sensecode.token", JSON.stringify(tokens));
      }
    } else {
      if (!engine.validate) {
        await this.context.secrets.store("sensecode.token", `{"${engine.label}": "${token}"}`);
        return;
      }
      let info = parseAuthInfo(token);
      await axios.get(`https://gitlab.bj.sensetime.com/api/v4/personal_access_tokens`,
        {
          // eslint-disable-next-line @typescript-eslint/naming-convention
          headers: { "PRIVATE-TOKEN": info.token || "" }
        })
        .then(
          async (res) => {
            if (res && res.data) {
              for (let t of res.data) {
                if (t.id === info.id && t.name === info.name) {
                  await this.context.secrets.store("sensecode.token", `{"${engine.label}": "${token}"}`);
                  return;
                }
              }
            }
            await this.setApiKey(engine, undefined);
            window.showErrorMessage("Invalid API Key", l10n.t("Close"));
          }
        ).catch(async (error) => {
          await this.setApiKey(engine, undefined);
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

  public get candidates(): number {
    return this.context.globalState.get("Candidates", 1);
  }

  public set candidates(v: number) {
    this.context.globalState.update("Candidates", v);
  }

  public get printOut(): boolean {
    return this.context.globalState.get("DirectPrintOut", false);
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