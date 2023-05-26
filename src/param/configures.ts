import axios from "axios";
import { ExtensionContext, l10n, workspace, WorkspaceConfiguration } from "vscode";

export interface Engine {
  label: string;
  url: string;
  config: any;
  // eslint-disable-next-line @typescript-eslint/naming-convention
  token_limit: number;
  key?: string;
  avatar?: string;
  sensetimeOnly?: boolean;
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
      temperature: 0.8
    },
    // eslint-disable-next-line @typescript-eslint/naming-convention
    token_limit: 2048,
    sensetimeOnly: true
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
    label: "Add Test",
    type: "test sample generation",
    prompt: "Generate a set of test cases and corresponding test code for the following code",
    icon: "science"
  },
  {
    label: "Code Conversion",
    type: "code language conversion",
    prompt: "Convert the given code to equivalent ${input:target language} code",
    icon: "repeat"
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
  }
];

export class Configuration {
  private configuration: WorkspaceConfiguration;
  private context: ExtensionContext;
  private isSensetimeEnv: boolean;
  constructor(context: ExtensionContext) {
    this.isSensetimeEnv = false;
    this.context = context;
    this.checkSensetimeEnv();
    this.configuration = workspace.getConfiguration("SenseCode", undefined);
    let lastVersion = this.context.globalState.get<string>("lastVersion");
    if (!lastVersion) {
      this.clear();
      this.context.globalState.update("lastVersion", context.extension.packageJSON.version);
    }
    this.update();
  }

  private async checkSensetimeEnv() {
    await axios.get(`https://gitlab.bj.sensetime.com/api/v4/user`).catch(e => {
      if (e.response.status === 401) {
        this.isSensetimeEnv = true;
      }
    });
  }

  public get sensetimeEnv(): boolean {
    return this.isSensetimeEnv;
  }

  public clear() {
    this.context.globalState.update("privacy", undefined);
    this.context.globalState.update("ActiveEngine", undefined);
    this.context.globalState.update("CompletionAutomatically", undefined);
    this.context.globalState.update("StreamResponse", undefined);
    this.context.globalState.update("Candidates", undefined);
    this.context.globalState.update("tokenPropensity", undefined);
    this.context.globalState.update("CompleteLine", undefined);
    this.context.globalState.update("delay", undefined);
    this.configuration.update("Engines", undefined, true);
    this.configuration.update("Prompt", undefined, true);
    this.context.secrets.delete("sensecode.token");
  }

  public update() {
    this.configuration = workspace.getConfiguration("SenseCode", undefined);
  }

  public getActiveEngine(): string {
    const ae = this.getActiveEngineInfo();
    return ae.label;
  }

  private getEngineInfo(engine?: string): Engine | undefined {
    if (!engine) {
      return undefined;
    }
    let es = this.engines.filter((e) => {
      return e.label === engine;
    });
    return es[0];
  }

  public getActiveEngineInfo(): Engine {
    let ae = this.context.globalState.get<string>("ActiveEngine");
    let e = this.getEngineInfo(ae);
    if (!e) {
      this.setActiveEngine(this.engines[0].label);
      return this.engines[0];
    }
    return e;
  }

  public async setActiveEngine(engine: string | undefined) {
    let engines = this.engines;
    if (engine) {
      let es = engines.filter((e) => {
        return e.label === engine;
      });
      engine = es[0].label;
    }
    if (!engine) {
      engine = engines[0].label;
    }
    await this.context.globalState.update("ActiveEngine", engine);
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

  public async username(engine: string): Promise<string | undefined> {
    let token = await this.getApiKey(engine);
    if (!token) {
      return;
    }
    const engineInfo = this.getEngineInfo(engine);
    if (!engineInfo) {
      return;
    }
    let info = parseAuthInfo(token);
    return info?.name;
  }

  public async avatar(engine: string): Promise<string | undefined> {
    const engineInfo = this.getEngineInfo(engine);
    if (!engineInfo || !engineInfo.sensetimeOnly) {
      return;
    }
    if (engineInfo.avatar !== undefined) {
      return engineInfo.avatar;
    }
    let token = await this.getApiKey(engine);
    if (!token) {
      return;
    }
    let info = parseAuthInfo(token);
    await this.getUserAvatar(info, engineInfo);
    return engineInfo.avatar;
  }

  public async getApiKeyRaw(engine: string): Promise<string> {
    let token = await this.getApiKey(engine);
    if (!token) {
      return Promise.reject(Error(l10n.t("API Key not set")));
    }
    const engineInfo = this.getEngineInfo(engine);
    let info = parseAuthInfo(token);
    if (engineInfo && engineInfo.sensetimeOnly) {
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
            throw (new Error(l10n.t("Invalid API Key")));
          }
        ).catch(async (error) => {
          return Promise.reject(error);
        });
    }
    return Buffer.from(info?.aksk, "base64").toString().trim();
  }

  public async getApiKey(engine: string): Promise<string | undefined> {
    let value = await this.context.secrets.get("sensecode.token");
    if (value) {
      try {
        let tokens = JSON.parse(value);
        let token = tokens[engine];
        if (token) {
          return token;
        }
        if (!token) {
          return this.getEngineInfo(engine)?.key;
        }
      } catch (e) {

      }
    } else {
      return this.getEngineInfo(engine)?.key;
    }
  }

  public async setApiKey(engine: string | undefined, token: string | undefined): Promise<boolean> {
    let engineInfo = this.getEngineInfo(engine);
    if (!engineInfo) {
      return false;
    }
    if (!token) {
      engineInfo.avatar = undefined;
      let value = await this.context.secrets.get("sensecode.token");
      if (value) {
        try {
          let tokens = JSON.parse(value);
          delete tokens[engineInfo.label];
          await this.context.secrets.store("sensecode.token", JSON.stringify(tokens));
          return true;
        } catch (e) {
          return false;
        };
      }
      return false;
    } else {
      let value = await this.context.secrets.get("sensecode.token");
      if (!value) {
        await this.context.secrets.store("sensecode.token", `{"${engineInfo.label}": "${token}"}`);
      } else {
        try {
          let tokens = JSON.parse(value);
          tokens[engineInfo.label] = token;
          await this.context.secrets.store("sensecode.token", JSON.stringify(tokens));
        } catch (e) {
          return false;
        };
      }
      if (engineInfo.sensetimeOnly) {
        let info = parseAuthInfo(token);
        await this.getUserAvatar(info, engineInfo);
      }
      return true;
    }
  }

  private async getUserAvatar(info: { id: number; name: string; token: string; aksk: string }, engine: Engine): Promise<string | undefined> {
    if (!engine.sensetimeOnly) {
      return;
    }
    return axios.get(`https://gitlab.bj.sensetime.com/api/v4/users?username=${info.name}`,
      {
        // eslint-disable-next-line @typescript-eslint/naming-convention
        headers: { "PRIVATE-TOKEN": info?.token || "" }
      })
      .then(
        (res1) => {
          if (res1?.status === 200) {
            if (res1.data[0]) {
              // eslint-disable-next-line @typescript-eslint/naming-convention
              engine.avatar = res1.data[0].avatar_url;
              return engine.avatar;
            }
          }
        }
      ).catch(async (_error) => {
        throw new Error();
      });
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

  public get tokenPropensity(): number {
    return this.context.globalState.get("tokenPropensity", 80);
  }

  public set tokenPropensity(v: number) {
    this.context.globalState.update("tokenPropensity", v);
  }

  public tokenForPrompt(engine?: string): number {
    let e = this.getEngineInfo(engine);
    if (e) {
      let mt = e.token_limit;
      let r = this.tokenPropensity;
      return Math.max(24, Math.floor(mt * r / 100));
    }
    return 0;
  }

  public maxTokenForResponse(engine?: string): number {
    let e = this.getEngineInfo(engine);
    if (e) {
      let mt = e.token_limit;
      let r = this.tokenPropensity;
      return Math.min(mt, Math.floor(mt * (100 - r) / 100));
    }
    return 0;
  }

  public get delay(): number {
    return this.context.globalState.get("delay", 1);
  }

  public set delay(v: number) {
    this.context.globalState.update("delay", v);
  }
}