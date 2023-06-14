import axios from "axios";
import { ExtensionContext, l10n, workspace, WorkspaceConfiguration } from "vscode";
import { ClientConfig, ClientMeta, SenseCoderClient } from "../sensecodeClient/src/sensecode-client";
import { IncomingMessage } from "http";

const builtinEngines: ClientConfig[] = [
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
  args?: any;
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
    prompt: "Convert the given code to equivalent ${input:$language} code",
    args: {
      language: {
        type: "enum",
        options: [
          "C",
          "C++",
          "CUDA C++",
          "C#",
          "Go",
          "Java",
          "JavaScript",
          "Lua",
          "Object-C++",
          "PHP",
          "Perl",
          "Python",
          "R",
          "Ruby",
          "Rust",
          "Swift",
          "TypeScript"
        ]
      }
    },
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

export class SenseCodeManager {
  private configuration: WorkspaceConfiguration;
  private context: ExtensionContext;
  private isSensetimeEnv: boolean;
  private _clients: SenseCoderClient[] = [];
  private static readonly meta: ClientMeta = {
    clientId: "52090a1b-1f3b-48be-8808-cb0e7a685dbd",
    redirectUrl: "vscode://sensetime.sensecode/login"
  };

  constructor(context: ExtensionContext) {
    this.isSensetimeEnv = false;
    this.context = context;
    this.checkSensetimeEnv();
    this.configuration = workspace.getConfiguration("SenseCode", undefined);
    let es = this.configuration.get<ClientConfig[]>("Engines", []);
    es = builtinEngines.concat(es);
    for (let e of es) {
      if (e.label && e.url) {
        this._clients.push(new SenseCoderClient(SenseCodeManager.meta, e));
      }
    }
    this.setupClientInfo();
  }

  private async setupClientInfo() {
    let tokens = await this.context.secrets.get("SenseCode.tokens");
    let ts: any = JSON.parse(tokens || "{}");
    for (let e of this._clients) {
      if (ts[e.label]) {
        e.restoreAuth(ts[e.label]);
      }
    }
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
    this.context.globalState.update("ActiveClient", undefined);
    this.context.globalState.update("CompletionAutomatically", undefined);
    this.context.globalState.update("StreamResponse", undefined);
    this.context.globalState.update("Candidates", undefined);
    this.context.globalState.update("tokenPropensity", undefined);
    this.context.globalState.update("CompleteLine", undefined);
    this.context.globalState.update("delay", undefined);
    this.configuration.update("Engines", undefined, true);
    this.configuration.update("Prompt", undefined, true);
    this.context.secrets.delete("SenseCode.tokens");
    for (let e of this._clients) {
      e.logout();
    }
  }

  public update() {
    this.checkSensetimeEnv();
    this.configuration = workspace.getConfiguration("SenseCode", undefined);
  }

  public async updateEngineList() {
    for (let e of this._clients) {
      e.logout();
    }
    this._clients = [];
    let es = this.configuration.get<ClientConfig[]>("Engines", []);
    es = builtinEngines.concat(es);
    for (let e of es) {
      if (e.label && e.url) {
        this._clients.push(new SenseCoderClient(SenseCodeManager.meta, e));
      }
    }
    await this.setupClientInfo();
  }

  private getClient(client?: string): SenseCoderClient | undefined {
    if (!client) {
      return undefined;
    }
    let es = this._clients.filter((e) => {
      return e.label === client;
    });
    return es[0];
  }

  private getActiveClient(): SenseCoderClient {
    let ae = this.context.globalState.get<string>("ActiveClient");
    let e = this.getClient(ae);
    if (!e) {
      this.setActiveClient(this._clients[0]?.label);
      return this._clients[0];
    }
    return e;
  }

  public getActiveClientLabel(): string {
    return this.getActiveClient().label;
  }

  public async setActiveClient(clientName: string | undefined) {
    let originClientState = this.context.globalState.get<string>("ActiveClient");
    if (originClientState !== clientName) {
      await this.context.globalState.update("ActiveClient", clientName);
    }
  }

  public async isClientLoggedin(clientName?: string) {
    let client: SenseCoderClient | undefined = this.getActiveClient();
    if (clientName) {
      client = this.getClient(clientName);
    }
    if (client) {
      let key = await client.getApiKeyRaw();
      return key !== undefined;
    }
    return false;
  }

  public get prompt(): Prompt[] {
    let customPrompts: { [key: string]: String | Prompt } = this.configuration.get("Prompt", {});
    let prompts: Prompt[] = [];
    for (let bp of builtinPrompts) {
      let bpclone = { ...bp };
      bpclone.label = l10n.t(bp.label);
      prompts.push(bpclone);
    }
    for (let label in customPrompts) {
      if (typeof customPrompts[label] === 'string') {
        prompts.push({ label, type: "custom", prompt: customPrompts[label] as string });
      } else {
        let p = customPrompts[label] as Prompt;
        p.label = label;
        p.type = "custom";
        prompts.push(p);
      }
    }
    return prompts;
  }

  public get clientsLabel(): string[] {
    let labels: string[] = [];
    for (let e of this._clients) {
      labels.push(e.label);
    }
    return labels;
  }

  public async username(clientName?: string): Promise<string | undefined> {
    let client: SenseCoderClient | undefined = this.getActiveClient();
    if (clientName) {
      client = this.getClient(clientName);
    }
    return client?.username();
  }

  public async avatar(clientName?: string): Promise<string | undefined> {
    let client: SenseCoderClient | undefined = this.getActiveClient();
    if (clientName) {
      client = this.getClient(clientName);
    }
    return client?.avatar();
  }

  public getAuthUrlLogin(codeVerifier: string, clientName?: string) {
    let client: SenseCoderClient | undefined = this.getActiveClient();
    if (clientName) {
      client = this.getClient(clientName);
    }
    return client?.getAuthUrlLogin(codeVerifier);
  }

  public async getTokenFromLoginResult(callbackUrl: string, codeVerifer: string, clientName?: string): Promise<boolean> {
    let client: SenseCoderClient | undefined = this.getActiveClient();
    if (clientName) {
      client = this.getClient(clientName);
    }
    if (!client) {
      return false;
    }
    return client.getTokenFromLoginResult(callbackUrl, codeVerifer).then(async (token) => {
      if (client && token) {
        let tokens = await this.context.secrets.get("SenseCode.tokens");
        let ts: any = JSON.parse(tokens || "{}");
        ts[client.label] = token;
        await this.context.secrets.store("SenseCode.tokens", JSON.stringify(ts));
        return true;
      } else {
        return false;
      }
    });
  }

  public async refreshToken(clientName?: string) {
    let client: SenseCoderClient | undefined = this.getActiveClient();
    if (clientName) {
      client = this.getClient(clientName);
    }
    if (!client) {
      return false;
    }
    return client.refreshToken().then(async (token) => {
      if (client && token) {
        let tokens = await this.context.secrets.get("SenseCode.tokens");
        let ts: any = JSON.parse(tokens || "{}");
        ts[client.label] = token;
        await this.context.secrets.store("SenseCode.tokens", JSON.stringify(ts));
        return true;
      } else {
        return false;
      }
    });
  }

  public async logout(clientName?: string) {
    let client: SenseCoderClient | undefined = this.getActiveClient();
    if (clientName) {
      client = this.getClient(clientName);
    }
    if (client) {
      client.logout();
      let tokens = await this.context.secrets.get("SenseCode.tokens");
      let ts: any = JSON.parse(tokens || "{}");
      ts[client.label] = undefined;
      await this.context.secrets.store("SenseCode.tokens", JSON.stringify(ts));
    }
  }

  public async getCompletions(prompt: string, n: number, maxToken: number, stopWord: string | undefined, signal: AbortSignal, clientName?: string) {
    let client: SenseCoderClient | undefined = this.getActiveClient();
    if (clientName) {
      client = this.getClient(clientName);
    }
    if (client) {
      return client.getCompletions(prompt, n, maxToken, stopWord, signal);
    }
  }

  public async getCompletionsStreaming(prompt: string, n: number, maxToken: number, stopWord: string | undefined, signal: AbortSignal, clientName?: string): Promise<IncomingMessage> {
    let client: SenseCoderClient | undefined = this.getActiveClient();
    if (clientName) {
      client = this.getClient(clientName);
    }
    if (client) {
      return client.getCompletionsStreaming(prompt, n, maxToken, stopWord, signal);
    } else {
      return Promise.reject(Error("Invalid client handle"));
    }
  }

  public async sendTelemetryLog(eventName: string, info: Record<string, any>, clientName?: string) {
    let client: SenseCoderClient | undefined = this.getActiveClient();
    if (clientName) {
      client = this.getClient(clientName);
    }
    if (client) {
      return client.sendTelemetryLog(eventName, info);
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

  public get tokenPropensity(): number {
    return this.context.globalState.get("tokenPropensity", 80);
  }

  public set tokenPropensity(v: number) {
    this.context.globalState.update("tokenPropensity", v);
  }

  public tokenForPrompt(clientName?: string): number {
    let client: SenseCoderClient | undefined = this.getActiveClient();
    if (clientName) {
      client = this.getClient(clientName);
    }
    if (client) {
      let mt = client.tokenLimit;
      let r = this.tokenPropensity;
      return Math.max(24, Math.floor(mt * r / 100));
    }
    return 0;
  }

  public maxToken(clientName?: string): number {
    let client: SenseCoderClient | undefined = this.getActiveClient();
    if (clientName) {
      client = this.getClient(clientName);
    }
    if (client) {
      return client.tokenLimit;
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