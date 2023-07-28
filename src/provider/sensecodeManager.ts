import axios from "axios";
import { commands, env, ExtensionContext, extensions, UIKind, Uri, window, workspace, WorkspaceConfiguration } from "vscode";
import { AuthInfo, ChatRequestParam, ClientConfig, ClientType, CodeClient, Message, ResponseData, Role, StopToken } from "../sensecodeClient/src/CodeClient";
import { ClientMeta, SenseCodeClient } from "../sensecodeClient/src/sensecode-client";
import { SenseNovaClient } from "../sensecodeClient/src/sensenova-client";
import { outlog } from "../extension";
import { builtinPrompts, SenseCodePrompt } from "./promptTemplates";
import { PromptType } from "./promptTemplates";
import { randomBytes } from "crypto";

const builtinEngines: ClientConfig[] = [
  {
    type: ClientType.sensecode,
    label: "SenseCode",
    url: "https://ams.sensecoreapi.cn/studio/ams/data/v1/chat/completions",
    config: {
      model: "penrose-411",
      temperature: 0.5
    },
    tokenLimit: 4096,
  }
];

export interface SenseCodeRequestParam {
  messages: Array<Message>;
  n: number | null;
  stop: StopToken;
  maxTokens: number;
}

export enum CompletionPreferenceType {
  speedPriority = "Speed Priority",
  balanced = "Balanced",
  bestEffort = "Best Effort"
}

export class SenseCodeManager {
  private seed: string = this.randomUUID();
  private configuration: WorkspaceConfiguration;
  private context: ExtensionContext;
  private _clients: CodeClient[] = [];
  private detectedProxyVersion = '0.0.0';
  private readonly requiredProxyVersion = '0.50.0';

  private randomUUID() {
    return randomBytes(20).toString('hex');
  }

  private async getProxy() {
    let proxy: any | undefined = undefined;
    let es = extensions.all;
    for (let e of es) {
      if (e.id === "SenseTime.sensetimeproxy") {
        this.detectedProxyVersion = e.packageJSON.version;
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
    return undefined;
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
    const meta: ClientMeta = {
      clientId: "52090a1b-1f3b-48be-8808-cb0e7a685dbd",
      redirectUrl: `${env.uriScheme}://${this.context.extension.id.toLowerCase()}/login`
    };
    let es = this.configuration.get<ClientConfig[]>("Engines", []);
    es = builtinEngines.concat(es);
    this._clients = [];
    for (let e of es) {
      if (e.label && e.url) {
        if (e.type === ClientType.sensenova) {
          this._clients.push(new SenseNovaClient(e, outlog.debug));
        } else {
          this._clients.push(new SenseCodeClient(meta, e, outlog.debug));
        }
      }
    }
    this.setupClientInfo();
    const proxy = await this.getProxy();
    for (let e1 of this._clients) {
      e1.proxy = proxy;
    }
    this.checkSensetimeEnv(!!proxy);
  }

  public async setAccessKey(name: string, ak: string, sk: string) {
    let client: CodeClient | undefined = this.getActiveClient();
    if (client) {
      return client.setAccessKey(name, ak, sk);
    }
  }

  private async setupClientInfo() {
    let tokens = await this.context.secrets.get("SenseCode.tokens");
    let ts: any = JSON.parse(tokens || "{}");
    for (let e of this._clients) {
      if (ts[e.label]) {
        e.restoreAuthInfo(ts[e.label]);
      }
      e.onDidChangeAuthInfo(async (client: CodeClient, token?: AuthInfo, refresh?: boolean) => {
        let tokens1 = await this.context.secrets.get("SenseCode.tokens");
        let ts1: any = JSON.parse(tokens1 || "{}");
        if (token && refresh) {
          this.context.globalState.update("SenseCode.tokenRefreshed", true);
        } else {
          this.context.globalState.update("SenseCode.tokenRefreshed", undefined);
        }
        ts1[client.label] = token;
        await this.context.secrets.store("SenseCode.tokens", JSON.stringify(ts1));
      });
    }
  }

  private async checkSensetimeEnv(proxyReady: boolean) {
    await axios.get(`https://sso.sensetime.com/enduser/sp/sso/`).catch(e => {
      if (e.response?.status === 500) {
        if (!proxyReady) {
          window.showWarningMessage("SenseTime 内网环境需安装 Proxy 插件并启用，通过 LDAP 账号登录使用", "下载", "已安装, 去启用").then(
            (v) => {
              if (v === "下载") {
                commands.executeCommand('vscode.open', Uri.parse(`http://kestrel.sensetime.com/tools/sensetimeproxy-${this.requiredProxyVersion}.vsix`));
              }
              if (v === "已安装, 去启用") {
                commands.executeCommand('workbench.extensions.search', '@installed sensetimeproxy');
              }
            }
          );
        } else if (this.detectedProxyVersion !== this.requiredProxyVersion) {
          window.showWarningMessage("SenseTime 内网环境所需的 Proxy 插件有更新版本，需要升级才能使用", "下载").then(
            (v) => {
              if (v === "下载") {
                commands.executeCommand('vscode.open', Uri.parse(`http://kestrel.sensetime.com/tools/sensetimeproxy-${this.requiredProxyVersion}.vsix`));
              }
            }
          );
        }
      }
    });
  }

  public clear() {
    let logoutAct: Promise<void>[] = [];
    for (let e of this._clients) {
      let logoutUrl = e.logoutUrl;
      if (logoutUrl) {
        commands.executeCommand("vscode.open", logoutUrl);
      }
      logoutAct.push(
        e.logout().then(() => {
        }, (err) => {
          // eslint-disable-next-line @typescript-eslint/naming-convention
          e.clearAuthInfo();
          outlog.debug(`Logout ${e.label} failed: ${err}`);
        })
      );
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
          message: {
            role: Role.user,
            content: `${promptProcessed}`
          },
          args
        });
      } else {
        let p: SenseCodePrompt = {
          label: label,
          type: PromptType.customPrompt,
          message: {
            role: Role.user,
            content: `${customPrompts[label].prompt}`
          },
          args: customPrompts[label].args
        };
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

  public async tryAutoLogin(clientName?: string) {
    let client: CodeClient | undefined = this.getActiveClient();
    if (clientName) {
      client = this.getClient(clientName);
    }
    if (client && !this.username(client.label) && env.uiKind === UIKind.Web) {
      return this.getProxy().then((proxy) => {
        if (proxy) {
          return client?.setAccessKey("User", "", "").then(() => { });
        }
      });
    }
  }

  public getAuthUrlLogin(clientName?: string) {
    let client: CodeClient | undefined = this.getActiveClient();
    if (clientName) {
      client = this.getClient(clientName);
    }
    if (client) {
      if (env.uiKind === UIKind.Web) {
        return Promise.resolve("command:sensecode.setAccessKey");
      }
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
      this.seed = this.randomUUID();
      verifier += env.machineId;
      return client.login(callbackUrl, verifier).then(async (token) => {
        progress.report({ increment: 100 });
        if (client && token) {
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
        let logoutUrl = client.logoutUrl;
        if (logoutUrl) {
          commands.executeCommand("vscode.open", logoutUrl);
        }
        await client.logout().then(() => {
          progress.report({ increment: 100 });
        }, (e) => {
          progress.report({ increment: 100 });
          client?.clearAuthInfo();
          window.showErrorMessage("Logout failed: " + e.message);
        });
      }
    });
  }

  public async getCompletions(config: SenseCodeRequestParam, signal?: AbortSignal, clientName?: string): Promise<ResponseData> {
    let client: CodeClient | undefined = this.getActiveClient();
    if (clientName) {
      client = this.getClient(clientName);
    }
    if (client) {
      let params: ChatRequestParam = {
        model: "",
        ...config
      };
      return client.getCompletions(params, signal);
    } else {
      return Promise.reject(Error("Invalid client handle"));
    }
  }

  public async getCompletionsStreaming(config: SenseCodeRequestParam, callback: (event: MessageEvent<ResponseData>) => void, signal: AbortSignal, clientName?: string) {
    let client: CodeClient | undefined = this.getActiveClient();
    if (clientName) {
      client = this.getClient(clientName);
    }
    if (client) {
      let params: ChatRequestParam = {
        model: "",
        ...config
      };
      client.getCompletionsStreaming(params, callback, signal);
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