import axios from "axios";
import * as crypto from "crypto";
import FormData = require("form-data");
import jwt_decode from "jwt-decode";
import { env, Uri, ExtensionContext, l10n, workspace, WorkspaceConfiguration } from "vscode";

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
  }

  private async checkSensetimeEnv() {
    await axios.get(`https://sso.sensetime.com/enduser/sp/sso/`).catch(e => {
      if (e.response?.status === 500) {
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
    for (let e of builtinEngines) {
      e.avatar = undefined;
      e.key = undefined;
    }
    this.context.secrets.delete("sensecode.token");
    this.context.secrets.delete("sensecode.user");
  }

  public update() {
    this.checkSensetimeEnv();
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
    let originEngine = this.getActiveEngine();
    let engines = this.engines;
    let userInfo = '';
    if (engine) {
      let es = engines.filter((e) => {
        return e.label === engine;
      });
      engine = es[0].label;
      userInfo = `${this.username(engine)}@${es[0].url}`;
    }
    if (!engine) {
      engine = engines[0].label;
      userInfo = `${this.username(engine)}@${engines[0].url}`;
    }
    if (originEngine !== engine) {
      await this.context.globalState.update("ActiveEngine", engine);
      this.context.secrets.store("sensecode.user", userInfo);
    }
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
    if (!engineInfo.avatar) {
      let token = await this.getApiKey(engine);
      if (!token) {
        return;
      }
      await this.getUserAvatar(token, engineInfo);
    }
    return engineInfo.avatar;
  }

  public async getApiKeyRaw(engine: string): Promise<string> {
    let token = await this.getApiKey(engine);
    if (!token) {
      return Promise.reject(Error(l10n.t("API Key not set")));
    }
    const engineInfo = this.getEngineInfo(engine);
    let info = parseAuthInfo(token);
    if (engineInfo && engineInfo.sensetimeOnly && info.id !== 0) {
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
          this.setApiKey(engine, undefined);
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
        let token = tokens[engine]["access_token"];
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

  public getAuthUrlLogin(engine: Engine): Uri {
    if (!engine.sensetimeOnly) {
      let clientId = '52090a1b-1f3b-48be-8808-cb0e7a685dbd';
      let baseUrl = 'https://signin.sensecore.cn';
      let apiUrl = Uri.parse(engine.url);
      if (apiUrl.authority === "ams.sensecoreapi.cn") {
        baseUrl = 'https://signin.sensecore.cn';
      } else if (apiUrl.authority === "ams.sensecoreapi.tech") {
        baseUrl = 'https://signin.sensecore.tech';
      } else if (apiUrl.authority === "ams.sensecoreapi.dev") {
        baseUrl = 'https://signin.sensecore.dev';
      }
      let challenge = crypto.createHash('sha256').update(env.machineId).digest("base64url");
      let url = `${baseUrl}/oauth2/auth?response_type=code&client_id=${clientId}&code_challenge_method=S256&code_challenge=${challenge}&state=${baseUrl}&scope=openid%20offline%20offline_access`;
      return Uri.parse(url);
    } else {
      let url = "https://sso.sensetime.com/enduser/sp/sso/sensetimeplugin_jwt102?enterpriseId=sensetime";
      return Uri.parse(url);
    }
  }

  private saveToken(engine: string, name: string, token: string, refreshToken?: string) {
    let s1 = Buffer.from(`0#${name}#67pnbtbheuJyBZmsx9rz`).toString('base64');
    let s2 = token;
    s1 = s1.split("=")[0];
    s2 = s2.split("=")[0];
    let len = Math.max(s1.length, s2.length);
    let key = '';
    for (let i = 0; i < len; i++) {
      if (i < s1.length) {
        key += s1[i];
      }
      if (i === s1.length) {
        key += ',';
      }
      if (i < s2.length) {
        key += s2[i];
      }
    }
    this.setApiKey(engine, key, refreshToken);
  }

  private async loginSenseCore(engine: string, code: string, authUrl: string) {
    var data = new FormData();
    data.append('client_id', '52090a1b-1f3b-48be-8808-cb0e7a685dbd');
    data.append('redirect_uri', 'vscode://sensetime.sensecode/login');
    data.append('grant_type', 'authorization_code');
    data.append('code_verifier', env.machineId);
    data.append('code', code);
    data.append('state', authUrl);

    return axios.post(`${authUrl}/oauth2/token`,
      data.getBuffer(),
      {
        headers: data.getHeaders()
      })
      .then((resp) => {
        if (resp && resp.status === 200) {
          let decoded: any = jwt_decode(resp.data.id_token);
          let name = decoded.id_token?.username;
          let token = Buffer.from(resp.data.access_token).toString('base64');
          this.saveToken(engine, name, token, resp.data.refresh_token);
          let e = this.getEngineInfo(engine);
          if (e) {
            let userInfo = `${name}@${e.url}`;
            this.context.secrets.store("sensecode.user", userInfo);
          }
        }
      });
  }

  public async login(uri: Uri) {
    if (uri.path === "/login") {
      let data = JSON.parse('{"' + decodeURI(uri.query).replace(/"/g, '\\"').replace(/&/g, '","').replace(/=/g, '":"') + '"}');
      return this.loginSenseCore(this.getActiveEngineInfo().label, data.code, data.state);
    } else if (uri.query) {
      let decoded: any = jwt_decode(uri.query);
      let name = decoded.id_token?.username || decoded.username;
      let token = ["O", "T", "V", "G", "N", "k", "V", "D", "O", "U", "Y", "0", "O", "E", "N", "D", "M", "D", "k", "4", "N", "E", "Y", "1", "N", "j", "J", "E", "Q", "U", "Y", "5", "R", "T", "U", "x", "M", "j", "A", "w", "N", "D", "E", "j", "N", "T", "c", "x", "N", "j", "B", "D", "R", "T", "A", "2", "M", "E", "I", "y", "N", "j", "Y", "5", "N", "E", "Q", "1", "N", "U", "R", "C", "N", "T", "I", "z", "M", "T", "A", "y", "M", "z", "c", "y", "M", "E", "U"];
      this.saveToken(this.getActiveEngineInfo().label, name, token.join(''));
      let userInfo = `${name}@${this.getActiveEngineInfo().url}`;
      this.context.secrets.store("sensecode.user", userInfo);
    } else {
      throw Error("Login Failed");
    }
  }

  public async refreshToken(engine: Engine) {
    let value = await this.context.secrets.get("sensecode.token");
    if (value) {
      try {
        let clientId = '52090a1b-1f3b-48be-8808-cb0e7a685dbd';
        let tokens = JSON.parse(value);
        let refreshToken = tokens[engine.label]["refresh_token"];
        if (refreshToken) {
          if (!engine.sensetimeOnly) {
            let baseUrl = 'https://signin.sensecore.cn';
            let apiUrl = Uri.parse(engine.url);
            if (apiUrl.authority === "ams.sensecoreapi.cn") {
              baseUrl = 'https://signin.sensecore.cn';
            } else if (apiUrl.authority === "ams.sensecoreapi.tech") {
              baseUrl = 'https://signin.sensecore.tech';
            } else if (apiUrl.authority === "ams.sensecoreapi.dev") {
              baseUrl = 'https://signin.sensecore.dev';
            }
            let url = `${baseUrl}/oauth2/token`;
            let date: string = new Date().toUTCString();
            let headers = {
              // eslint-disable-next-line @typescript-eslint/naming-convention
              "Date": date,
              // eslint-disable-next-line @typescript-eslint/naming-convention
              "Content-Type": "application/x-www-form-urlencoded"
            };
            axios.post(url,
              `grant_type=refresh_token&client_id=${clientId}&refresh_token=${refreshToken}`,
              { headers })
              .then((resp) => {
                if (resp && resp.status === 200) {
                  let decoded: any = jwt_decode(resp.data.id_token);
                  let name = decoded.id_token?.username;
                  let token = Buffer.from(resp.data.access_token).toString('base64');
                  this.saveToken(engine.label, name, token, resp.data.refresh_token);
                }
              });
          } else {
          }
        }
      } catch (e) {
      }
    }
  }

  public async setApiKey(engine: string | undefined, token?: string, refreshToken?: string): Promise<boolean> {
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
          let userInfo = `Null@${engineInfo.url}`;
          this.context.secrets.store("sensecode.user", userInfo);
          return true;
        } catch (e) {
          return false;
        };
      }
      return false;
    } else {
      await this.getUserAvatar(token, engineInfo);
      let info = {
        // eslint-disable-next-line @typescript-eslint/naming-convention
        "access_token": token,
        // eslint-disable-next-line @typescript-eslint/naming-convention
        "refresh_token": refreshToken
      };
      let value = await this.context.secrets.get("sensecode.token");
      if (!value) {
        let tokens: any = {};
        tokens[engineInfo.label] = info;
        await this.context.secrets.store("sensecode.token", JSON.stringify(tokens));
      } else {
        try {
          let tokens = JSON.parse(value);
          tokens[engineInfo.label] = info;
          await this.context.secrets.store("sensecode.token", JSON.stringify(tokens));
        } catch (e) {
          return false;
        };
      }
      return true;
    }
  }

  private async getUserAvatar(token: string, engine: Engine): Promise<string | undefined> {
    let info = parseAuthInfo(token);
    if (!engine.sensetimeOnly || !info.name) {
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
        return "";
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