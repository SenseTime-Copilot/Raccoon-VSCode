import axios from "axios";
import { commands, env, ExtensionContext, extensions, Uri, window, workspace, WorkspaceConfiguration } from "vscode";
import { AuthProxy, CodeClient, Prompt } from "../sensecodeClient/src/CodeClient";
import { ClientConfig, ClientMeta, SenseCodeClient } from "../sensecodeClient/src/sensecode-client";
import { IncomingMessage } from "http";
import { outlog } from "../extension";
import { builtinPrompts, SenseCodePrompt } from "./promptTemplates";
import { PromptType } from "./promptTemplates";
import { randomUUID } from "crypto";

const builtinEngines: ClientConfig[] = [
  {
    label: "Penrose",
    url: "https://ams.sensecoreapi.cn/studio/ams/data/v1/completions",
    config: {
      model: "penrose-411",
      temperature: 0.5
    },
    // eslint-disable-next-line @typescript-eslint/naming-convention
    token_limit: 4096,
  }
];

export enum CompletionPreferenceType {
  speedPriority = "Speed Priority",
  balanced = "Balanced",
  bestEffort = "Best Effort"
}

export class SenseCodeManager {
  private seed: string = randomUUID();
  private configuration: WorkspaceConfiguration;
  private context: ExtensionContext;
  private _clients: CodeClient[] = [];
  private static readonly meta: ClientMeta = {
    clientId: "52090a1b-1f3b-48be-8808-cb0e7a685dbd",
    redirectUrl: "vscode://sensetime.sensecode/login"
  };

  private async getProxy() {
    let proxy: AuthProxy | undefined = undefined;
    let es = extensions.all;
    for (let e of es) {
      if (e.id === "SenseTime.sensetimeproxy") {
        if (e.isActive) {
          proxy = e.exports;
        } else {
          await e.activate().then((apis) => {
            proxy = apis;
          }, () => {
            console.log("Activate 'SenseTime.sensetimeproxy' failed");
          });
        }
        return proxy;
      }
    }
  }

  constructor(context: ExtensionContext) {
    extensions.onDidChange(() => {
      this.getProxy().then((proxy) => {
        for (let e of this._clients) {
          e.proxy = proxy;
        }
      });
    });
    this.context = context;
    this.configuration = workspace.getConfiguration("SenseCode", undefined);
    this.buildAllClient();
  }

  private async buildAllClient() {
    let es = this.configuration.get<ClientConfig[]>("Engines", []);
    es = builtinEngines.concat(es);
    for (let e of es) {
      if (e.label && e.url) {
        this._clients.push(new SenseCodeClient(SenseCodeManager.meta, e, outlog.debug));
      }
    }
    this.setupClientInfo();
    const proxy = await this.getProxy();
    for (let e_1 of this._clients) {
      e_1.proxy = proxy;
    }
    this.checkSensetimeEnv(proxy);
  }

  private async setupClientInfo() {
    let tokens = await this.context.secrets.get("SenseCode.tokens");
    let ts: any = JSON.parse(tokens || "{}");
    for (let e of this._clients) {
      if (ts[e.label]) {
        e.restoreAuthInfo(ts[e.label]);
      }
    }
  }

  private async checkSensetimeEnv(proxy: AuthProxy | undefined) {
    await axios.get(`https://sso.sensetime.com/enduser/sp/sso/`).catch(e => {
      if (e.response?.status === 500 && !proxy) {
        window.showWarningMessage("SenseTime 内网环境需安装 Proxy 插件并启用，通过 LDAP 账号登录使用", "下载", "已安装, 去启用").then(
          (v) => {
            if (v === "下载") {
              commands.executeCommand('vscode.open', Uri.parse("http://kestrel.sensetime.com/tools/sensetimeproxy-0.40.0.vsix"));
            }
            if (v === "已安装, 去启用") {
              commands.executeCommand('workbench.extensions.search', '@installed sensetimeproxy');
            }
          }
        );
      }
    });
  }

  public clear() {
    let logoutAct: Promise<void>[] = [];
    for (let e of this._clients) {
      logoutAct.push(
        this.doLogout(e).then(() => { }, (err) => {
          // eslint-disable-next-line @typescript-eslint/naming-convention
          e.restoreAuthInfo({ username: "", avatar: undefined, idToken: "", weaverdKey: "", refreshToken: undefined });
          outlog.debug(`Logout ${e.label} failed: ${err}`);
        }));
    }
    Promise.all(logoutAct).then(() => {
      this.clearStatusData();
    }, () => {
      this.clearStatusData();
    });
  }

  private clearStatusData() {
    this.context.globalState.update("privacy", undefined);
    this.context.globalState.update("ActiveClient", undefined);
    this.context.globalState.update("CompletionAutomatically", undefined);
    this.context.globalState.update("CompletionPreference", undefined);
    this.context.globalState.update("StreamResponse", undefined);
    this.context.globalState.update("Candidates", undefined);
    this.context.globalState.update("Delay", undefined);
    this.configuration.update("Prompt", undefined, true);
    this.context.secrets.delete("SenseCode.tokens");
  }

  public update() {
    this.configuration = workspace.getConfiguration("SenseCode", undefined);
  }

  public async updateEngineList() {
    for (let e of this._clients) {
      await e.logout();
    }
    return this.buildAllClient();
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

  public get prompt(): SenseCodePrompt[] {
    let customPrompts: { [key: string]: string | any } = this.configuration.get("Prompt", {});
    let prompts: SenseCodePrompt[] = JSON.parse(JSON.stringify(builtinPrompts));
    for (let label in customPrompts) {
      if (typeof customPrompts[label] === 'string') {
        let promptStr = customPrompts[label] as string;
        let promptProcessed = customPrompts[label] as string;
        let regex = /{input(:[^}]*)?\}/g;
        let m;
        let args: any = {};
        while ((m = regex.exec(promptStr)) !== null) {
          if (m.index === regex.lastIndex) {
            regex.lastIndex++;
          }
          let placeholder;
          if (m.length > 1 && m[1]) {
            placeholder = m[1].slice(1);
          }
          promptProcessed = promptProcessed.replace(m[0], `\{v${m.index}\}`);
          args[`v${m.index}`] = {
            type: "text",
            placeholder
          };
        }
        prompts.push({
          label,
          type: PromptType.customPrompt,
          prologue: `<|system|>\n<|end|>`,
          prompt: `<|user|>${promptProcessed}<|end|>`,
          suffix: "<|assistant|>",
          args
        });
      } else {
        let p: SenseCodePrompt = {
          label: label,
          type: PromptType.customPrompt,
          ...customPrompts[label]
        };
        if (!p.prologue) {
          p.prologue = `<|system|>\n<|end|>`;
        }
        if (!p.suffix) {
          p.suffix = "<|assistant|>";
        }
        prompts.push(p);
      }
    }
    for (let p of prompts) {
      if (p.args && Object.keys(p.args).length > 0) {
        p.label += "...";
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

  public getAuthUrlLogin(clientName?: string) {
    let client: CodeClient | undefined = this.getActiveClient();
    if (clientName) {
      client = this.getClient(clientName);
    }
    if (client) {
      let verifier = this.seed;
      verifier += env.machineId;
      return client.getAuthUrlLogin(verifier);
    } else {
      return Promise.reject();
    }
  }

  public getTokenFromLoginResult(callbackUrl: string, clientName?: string): Thenable<boolean> {
    let client: CodeClient | undefined = this.getActiveClient();
    if (clientName) {
      client = this.getClient(clientName);
    }

    return window.withProgress({
      location: { viewId: "sensecode.view" }
    }, async (progress, _cancel) => {
      if (!client) {
        return false;
      }
      let verifier = this.seed;
      this.seed = randomUUID();
      verifier += env.machineId;
      return client.login(callbackUrl, verifier).then(async (token) => {
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
      }, (_err) => {
        return false;
      });
    });
  }

  public async logout(clientName?: string) {
    return window.withProgress({
      location: { viewId: "sensecode.view" }
    }, async (progress, _cancel) => {
      let client: CodeClient | undefined = this.getActiveClient();
      if (clientName) {
        client = this.getClient(clientName);
      }
      if (client) {
        await this.doLogout(client).then(() => {
          progress.report({ increment: 100 });
        }, (e) => {
          progress.report({ increment: 100 });
          window.showErrorMessage("Logout failed: " + e.message);
        });
      }
    });
  }

  private async doLogout(client: CodeClient) {
    return client.logout().then(async () => {
      let tokens = await this.context.secrets.get("SenseCode.tokens");
      let ts: any = JSON.parse(tokens || "{}");
      ts[client.label] = undefined;
      await this.context.secrets.store("SenseCode.tokens", JSON.stringify(ts));
    });
  }

  private async refreshToken(client: CodeClient | undefined) {
    if (client) {
      let auth = await client.refreshToken();
      let tokens = await this.context.secrets.get("SenseCode.tokens");
      let ts: any = JSON.parse(tokens || "{}");
      ts[client.label] = auth;
      this.context.globalState.update("SenseCode.tokenRefreshed", true);
      await this.context.secrets.store("SenseCode.tokens", JSON.stringify(ts));
    }
  }

  public async getCompletions(prompt: Prompt, n: number, maxToken: number, stopWord: string | undefined, signal: AbortSignal, clientName?: string, skipRetry?: boolean): Promise<any> {
    let client: CodeClient | undefined = this.getActiveClient();
    if (clientName) {
      client = this.getClient(clientName);
    }
    if (client) {
      return client.getCompletions(prompt, n, maxToken, stopWord, signal).then((resp) => {
        return resp;
      }, async (err) => {
        if (!skipRetry && err.response?.status === 401) {
          await this.refreshToken(client);
          return this.getCompletions(prompt, n, maxToken, stopWord, signal, clientName, true);
        }
        throw (err);
      });
    } else {
      return Promise.reject(Error("Invalid client handle"));
    }
  }

  public async getCompletionsStreaming(prompt: Prompt, n: number, maxToken: number, stopWord: string | undefined, signal: AbortSignal, clientName?: string, skipRetry?: boolean): Promise<IncomingMessage> {
    let client: CodeClient | undefined = this.getActiveClient();
    if (clientName) {
      client = this.getClient(clientName);
    }
    if (client) {
      return client.getCompletionsStreaming(prompt, n, maxToken, stopWord, signal).then((resp) => {
        return resp;
      }, async (err) => {
        if (!skipRetry && err.response?.status === 401) {
          try {
            await this.refreshToken(client);
          } catch (e) {

          }
          return this.getCompletionsStreaming(prompt, n, maxToken, stopWord, signal, clientName, true);
        }
        throw (err);
      });
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

  public get completionPreference(): CompletionPreferenceType {
    return this.context.globalState.get("CompletionPreference", CompletionPreferenceType.speedPriority);
  }

  public set completionPreference(v: CompletionPreferenceType) {
    this.context.globalState.update("CompletionPreference", v);
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
    return this.context.globalState.get("Delay", 1);
  }

  public set delay(v: number) {
    this.context.globalState.update("Delay", v);
  }
}