import axios from "axios";
import { ExtensionContext, window, workspace, WorkspaceConfiguration } from "vscode";
import { ClientConfig, ClientMeta, CodeClient, Prompt, SenseCodeClient } from "../sensecodeClient/src/sensecode-client";
import { IncomingMessage } from "http";
import { outlog } from "../extension";
import { builtinPrompts, PromptInfo } from "./promptTemplates";
import { PromptType } from "./promptTemplates";

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

export class SenseCodeManager {
  private configuration: WorkspaceConfiguration;
  private context: ExtensionContext;
  private isSensetimeEnv: boolean;
  private _clients: CodeClient[] = [];
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
        this._clients.push(new SenseCodeClient(SenseCodeManager.meta, e, outlog.debug));
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
        this._clients.push(new SenseCodeClient(SenseCodeManager.meta, e, outlog.debug));
      }
    }
    await this.setupClientInfo();
  }

  private getClient(client?: string): CodeClient | undefined {
    if (!client) {
      return undefined;
    }
    let es = this._clients.filter((e) => {
      return e.label === client;
    });
    return es[0];
  }

  private getActiveClient(): CodeClient {
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

  public isClientLoggedin(clientName?: string) {
    let client: CodeClient | undefined = this.getActiveClient();
    if (clientName) {
      client = this.getClient(clientName);
    }
    if (client) {
      return client.username !== undefined;
    }
    return false;
  }

  public get prompt(): PromptInfo[] {
    let customPrompts: { [key: string]: string | any } = this.configuration.get("Prompt", {});
    let prompts: PromptInfo[] = [...builtinPrompts];
    for (let label in customPrompts) {
      if (typeof customPrompts[label] === 'string') {
        prompts.push(new PromptInfo({
          label,
          type: PromptType.customPrompt,
          prologue: `Below is an instruction that describes a task. Write a response that appropriately completes the request.

### Instruction:
Answer question: `,
          prompt: customPrompts[label] as string,
          suffix: "### Response:\n"
        }));
      } else {
        prompts.push(new PromptInfo({
          label,
          type: PromptType.customPrompt,
          ...customPrompts[label]
        }));
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

  public username(clientName?: string): string | undefined {
    let client: CodeClient | undefined = this.getActiveClient();
    if (clientName) {
      client = this.getClient(clientName);
    }
    if (client) {
      return client.username;
    }
  }

  public avatar(clientName?: string): string | undefined {
    let client: CodeClient | undefined = this.getActiveClient();
    if (clientName) {
      client = this.getClient(clientName);
    }
    if (client) {
      return client.avatar;
    }
  }

  public getAuthUrlLogin(codeVerifier: string, clientName?: string) {
    let client: CodeClient | undefined = this.getActiveClient();
    if (clientName) {
      client = this.getClient(clientName);
    }
    if (client) {
      return client.getAuthUrlLogin(codeVerifier);
    } else {
      return Promise.reject();
    }
  }

  public async getTokenFromLoginResult(callbackUrl: string, codeVerifer: string, clientName?: string): Promise<boolean> {
    let client: CodeClient | undefined = this.getActiveClient();
    if (clientName) {
      client = this.getClient(clientName);
    }
    if (!client) {
      return false;
    }

    window.withProgress({
      location: { viewId: "sensecode.view" }
    }, async (progress, _cancel) => {
      if (!client) {
        return Promise.reject();
      }
      return client.getTokenFromLoginResult(callbackUrl, codeVerifer).then(async (token) => {
        progress.report({ increment: 100 });
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
    });

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
    let client: CodeClient | undefined = this.getActiveClient();
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
    let client: CodeClient | undefined = this.getActiveClient();
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

  public async getCompletions(prompt: Prompt, n: number, maxToken: number, stopWord: string | undefined, signal: AbortSignal, clientName?: string) {
    let client: CodeClient | undefined = this.getActiveClient();
    if (clientName) {
      client = this.getClient(clientName);
    }
    if (client) {
      return client.getCompletions(prompt, n, maxToken, stopWord, signal);
    }
  }

  public async getCompletionsStreaming(prompt: Prompt, n: number, maxToken: number, stopWord: string | undefined, signal: AbortSignal, clientName?: string): Promise<IncomingMessage> {
    let client: CodeClient | undefined = this.getActiveClient();
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
    let client: CodeClient | undefined = this.getActiveClient();
    if (clientName) {
      client = this.getClient(clientName);
    }
    if (client && client.sendTelemetryLog) {
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
    let client: CodeClient | undefined = this.getActiveClient();
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
    let client: CodeClient | undefined = this.getActiveClient();
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