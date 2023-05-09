import axios from "axios";
import { ExtensionContext, l10n, workspace, WorkspaceConfiguration } from "vscode";

export interface Engine {
  label: string;
  url: string;
  config: any;
  key?: string;
  avatar?: string;
  validate?: boolean;
}

function demerge(m: string): string[] {
  var a = '';
  var b = '';
  var t = true;
  var flip = true;
  for (var i = 0; i < m.length; i++) {
    if (m[i] === ',') {
      flip = false;
      t = !t;
      continue;
    }
    if (t) {
      a += m[i];
    } else {
      b += m[i];
    }
    if (flip) {
      t = !t;
    }
  }
  return [a, b];
}

function parseAuthInfo(info: string) {
  let tokenKey = demerge(info);
  let p1 = Buffer.from(tokenKey[0], "base64").toString().trim().split("#");
  return {
    id: parseInt(p1[0]),
    name: p1[1],
    token: p1[2],
    aksk: tokenKey[1]
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
      max_tokens: 1200,
      stop: "\n\n",
      temperature: 0.8
    },
    validate: true
  }
];

export interface Prompt {
  label: string;
  type: string;
  prompt: string;
  brush?: boolean;
  icon?: string;
}

const builtinPrompts: Prompt[] = [
  {
    label: "Generation",
    type: "code generation",
    prompt: "code generation",
    brush: true,
    icon: "process_chart"
  },
  {
    label: "Completion",
    type: "code completion",
    prompt: "Please complete the following code",
    brush: true,
    icon: "gradient"
  },
  {
    label: "Blank Filling",
    type: "code blank filling",
    prompt: "Complete the following code, fill in the missing parts",
    brush: true,
    icon: "format_image_right"
  },
  {
    label: "Code Correction",
    type: "code error correction",
    prompt: "Identify and correct any errors in the following code snippet",
    brush: true,
    icon: "add_task"
  },
  {
    label: "Refactoring",
    type: "code refactoring and optimization",
    prompt: "Refactor the given code to improve readability, modularity, and maintainability",
    brush: true,
    icon: "construction"
  },
  {
    label: "Add Test",
    type: "test sample generation",
    prompt: "Generate a set of test cases and corresponding test code for the following code",
    icon: "science"
  },
  {
    label: "Complexity Analysis",
    type: "code complexity analysis",
    prompt: "Analyze the space and time complexity of the provided code. Provide a brief explanation of the code and the reasoning behind the complexities",
    icon: "multiline_chart"
  },
  {
    label: "Code Conversion",
    type: "code language conversion",
    prompt: "Convert the given code equivalent ${input:target language} code",
    icon: "repeat"
  }
];

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
    this.checkApiKey(this.activeEngine);
  }

  public clear() {
    this.context.globalState.update("privacy", undefined);
    this.context.globalState.update("engine", undefined);
    this.context.globalState.update("CompletionAutomatically", undefined);
    this.context.globalState.update("StreamResponse", undefined);
    this.context.globalState.update("Candidates", undefined);
    this.context.globalState.update("CompleteLine", undefined);
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

  public get prompt(): Prompt[] {
    let customPrompts: { [key: string]: string } = this.configuration.get("Prompt", {});
    let prompts: Prompt[] = [];
    for (let bp of builtinPrompts) {
      let bpclone = { ...bp };
      bpclone.label = l10n.t(bp.label);
      prompts.push(bpclone);
    }
    for (let label in customPrompts) {
      prompts.push({ label, type: "custom", prompt: customPrompts[label] });
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
    return info?.name;
  }

  public async getApiKeyRaw(engine: Engine): Promise<string> {
    let token = await this.getApiKey(engine);
    if (!token) {
      return Promise.reject(Error("API Key not set"));
    }
    if (!engine.validate) {
      return token;
    }
    let info = parseAuthInfo(token);
    return axios.get(`https://gitlab.bj.sensetime.com/api/v4/user`,
      {
        // eslint-disable-next-line @typescript-eslint/naming-convention
        headers: { "PRIVATE-TOKEN": info?.token || "" }
      })
      .then(
        async (res) => {
          if (res?.data?.name === "kestrel.guest" && info?.aksk) {
            return Buffer.from(info?.aksk, "base64").toString().trim();
          }
          throw (new Error("Invalid API Key"));
        }
      ).catch(async (error) => {
        return Promise.reject(error);
      });
  }

  public async getApiKey(engine: Engine): Promise<string | undefined> {
    let value = await this.context.secrets.get("sensecode.token");
    if (value) {
      try {
        let tokens = JSON.parse(value);
        let token = tokens[engine.label];
        if (token) {
          return token;
        }
        if (!token && !engine.validate) {
          return engine.key;
        }
      } catch (e) {

      }
    } else {
      return engine.key;
    }
  }

  public async setApiKey(engine: Engine | undefined, token: string | undefined): Promise<boolean> {
    if (!engine) {
      return false;
    }
    if (!token) {
      engine.avatar = undefined;
      let value = await this.context.secrets.get("sensecode.token");
      if (value) {
        try {
          let tokens = JSON.parse(value);
          delete tokens[engine.label];
          await this.context.secrets.store("sensecode.token", JSON.stringify(tokens));
          return true;
        } catch (e) {
          return false;
        };
      }
      return false;
    } else {
      if (!engine.validate) {
        await this.context.secrets.store("sensecode.token", `{"${engine.label}": "${token}"}`);
        return true;
      }
      let info = parseAuthInfo(token);
      let ok = await this.checkUserExist(info, engine);
      if (ok) {
        await this.context.secrets.store("sensecode.token", `{"${engine.label}": "${token}"}`);
        return true;
      }
      return false;
    }
  }

  private async checkApiKey(engine?: Engine): Promise<boolean> {
    if (!engine) {
      return false;
    }
    if (!engine.validate) {
      return true;
    }
    let token = await this.getApiKey(engine);
    if (!token) {
      return false;
    }
    return this.checkUserExist(parseAuthInfo(token), engine);
  }

  private async checkUserExist(info: { id: number; name: string; token: string; aksk: string }, engine: Engine, page?: string): Promise<boolean> {
    try {
      let res = await axios.get(`https://gitlab.bj.sensetime.com/api/v4/personal_access_tokens?per_page=100${page ? `&page=${page}` : ""}`,
        {
          // eslint-disable-next-line @typescript-eslint/naming-convention
          headers: { "PRIVATE-TOKEN": info?.token || "" }
        });

      if (res && res.data) {
        for (let t of res.data) {
          if (t.id === info?.id && t.name === info?.name) {
            engine.avatar = await axios.get(`https://gitlab.bj.sensetime.com/api/v4/users?username=${t.name}`,
              {
                // eslint-disable-next-line @typescript-eslint/naming-convention
                headers: { "PRIVATE-TOKEN": info?.token || "" }
              })
              .then(
                (res1) => {
                  if (res1?.status === 200 && res1.data[0]) {
                    // eslint-disable-next-line @typescript-eslint/naming-convention
                    return res1.data[0].avatar_url;
                  }
                }
              ).catch(async (_error) => {
              });
            return true;
          }
        }
      }
      if (res && res.headers["x-next-page"]) {
        return this.checkUserExist(info, engine, res.headers["x-next-page"]);
      } else {
        return false;
      }
    } catch (err) {
      await this.setApiKey(engine, undefined);
      throw (new Error("Invalid API Key"));
    }
  }

  public get autoComplete(): boolean {
    return this.context.globalState.get("CompletionAutomatically", true);
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

  public set completeLine(v: boolean) {
    this.context.globalState.update("CompleteLine", v);
  }

  public get completeLine(): boolean {
    return this.context.globalState.get("CompleteLine", true);
  }

  public get delay(): number {
    return this.context.globalState.get("delay", 1);
  }

  public set delay(v: number) {
    this.context.globalState.update("delay", v);
  }
}