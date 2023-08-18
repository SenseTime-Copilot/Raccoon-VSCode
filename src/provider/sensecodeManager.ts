import axios from "axios";
import { commands, env, ExtensionContext, extensions, l10n, UIKind, Uri, window, workspace, WorkspaceConfiguration } from "vscode";
import { AuthInfo, ChatRequestParam, ClientConfig, ClientReqeustOptions, ClientType, CodeClient, ResponseData, Role } from "../sensecodeClient/src/CodeClient";
import { SenseCodeClientMeta, SenseCodeClient } from "../sensecodeClient/src/sensecode-client";
import { SenseNovaClient, SenseNovaClientMeta } from "../sensecodeClient/src/sensenova-client";
import { outlog } from "../extension";
import { builtinPrompts, SenseCodePrompt } from "./promptTemplates";
import { PromptType } from "./promptTemplates";
import { randomBytes } from "crypto";
import { deleteAllCacheFiles, SenseCodeViewProvider } from "./webviewProvider";
import { OpenAIClient } from "../sensecodeClient/src/openai-client";

const builtinEngines: ClientConfig[] = [
  {
    type: ClientType.sensecore,
    label: "SenseCode",
    url: "https://ams.sensecoreapi.cn/studio/ams/data/v1/chat/completions",
    config: {
      model: "penrose-411",
      temperature: 0.5
    },
    maxInputTokenNum: 4096,
    totalTokenNum: 8192
  }
];

type SenseCodeRequestParam = Pick<ChatRequestParam, "messages" | "n" | "stop" | "maxNewTokenNum">;

export enum CompletionPreferenceType {
  speedPriority = "Speed Priority",
  balanced = "Balanced",
  bestEffort = "Best Effort"
}

interface ClientAndAuthInfo {
  client: CodeClient;
  authInfo?: AuthInfo;
}

interface CodeExtension {
  filterType: () => ClientType;
  factory: (clientConfig: ClientConfig, debug?: (message: string, ...args: any[]) => void) => CodeClient | undefined;
}

export class SenseCodeManager {
  private seed: string = this.randomUUID();
  private configuration: WorkspaceConfiguration;
  private _clients: { [key: string]: ClientAndAuthInfo } = {};
  private detectedProxyVersion = '0.0.0';
  private readonly requiredProxyExtension = "SenseTime.sensetimeproxy";
  private readonly requiredProxyVersion = '0.50.0';

  private randomUUID(): string {
    return randomBytes(20).toString('hex');
  }

  private async getProxy(): Promise<CodeExtension | undefined> {
    let proxy: CodeExtension | undefined = undefined;
    let es = extensions.all;
    for (let e of es) {
      if (e.id === this.requiredProxyExtension) {
        this.detectedProxyVersion = e.packageJSON.version;
        if (e.isActive) {
          proxy = e.exports as CodeExtension;
        } else {
          await e.activate().then((apis) => {
            proxy = apis as CodeExtension;
          }, () => {
            console.log(`Activate '${this.requiredProxyExtension}' failed`);
          });
        }
        return proxy;
      }
    }
    return undefined;
  }

  constructor(private readonly context: ExtensionContext) {
    let flag = `${context.extension.id}-${context.extension.packageJSON.version}`;
    this.configuration = workspace.getConfiguration("SenseCode", undefined);
    let ret = context.globalState.get<boolean>(flag);
    if (!ret) {
      this.resetAllCacheData();
      context.globalState.update(flag, true);
    }

    context.subscriptions.push(extensions.onDidChange(() => {
      this.updateEngineList();
    }));
    this.updateEngineList();
  }

  private async buildAllClient(ext?: CodeExtension): Promise<void> {
    let tks = await this.context.secrets.get("SenseCode.tokens");
    let authinfos: any = {};
    if (tks) {
      try {
        authinfos = JSON.parse(tks);
      } catch (e) { }
    }
    let es = this.configuration.get<ClientConfig[]>("Engines", []);
    es = builtinEngines.concat(es);
    this._clients = {};
    for (let e of es) {
      if (e.type && e.label && e.url) {
        let client;
        if (e.type === ext?.filterType()) {
          client = ext.factory(e, outlog.debug);
        } else if (e.type === ClientType.sensenova) {
          const meta: SenseNovaClientMeta = {
            clientId: "",
            redirectUrl: `${env.uriScheme}://${this.context.extension.id.toLowerCase()}/login`
          };
          client = new SenseNovaClient(meta, e, outlog.debug);
        } else if (e.type === ClientType.sensecore) {
          const meta: SenseCodeClientMeta = {
            clientId: "52090a1b-1f3b-48be-8808-cb0e7a685dbd",
            redirectUrl: `${env.uriScheme}://${this.context.extension.id.toLowerCase()}/login`
          };
          client = new SenseCodeClient(meta, e, outlog.debug);
        } else if (e.type === ClientType.openai) {
          client = new OpenAIClient(e, outlog.debug);
        }
        if (client) {
          client.onDidChangeAuthInfo((ai) => {
            this.updateToken(e.label, ai, true);
          });
          this.appendClient(e.label, { client, authInfo: authinfos[e.label] }, e);
        }
      }
    }

    if (env.uiKind !== UIKind.Web) {
      this.checkSensetimeEnv(!!ext);
    }
  }

  private async appendClient(name: string, c: ClientAndAuthInfo, cfg: ClientConfig) {
    this._clients[name] = c;
    if (cfg.key) {
      await c.client.setAccessKey(cfg.key).then(async (ai) => {
        await this.updateToken(name, ai, true);
      });
    } else if (c.authInfo) {
      if (cfg.username) {
        c.authInfo.account.username = cfg.username;
      }
      await this.updateToken(name, c.authInfo, true);
    }
  }

  public async setAccessKey(key: string, clientName?: string): Promise<void> {
    let ca: ClientAndAuthInfo | undefined = this.getActiveClient();
    if (clientName) {
      ca = this.getClient(clientName);
    }
    if (ca) {
      await ca.client.setAccessKey(key).then(async ai => {
        await this.updateToken(ca!.client.label, ai);
      });
    }
  }

  private async updateToken(clientName: string, ai?: AuthInfo, quite?: boolean) {
    let tks = await this.context.secrets.get("SenseCode.tokens");
    let authinfos: any = {};
    if (tks) {
      try {
        authinfos = JSON.parse(tks);
        authinfos[clientName] = ai;
        let ca = this.getClient(clientName);
        if (ca) {
          ca.authInfo = ai;
        }
      } catch (e) { }
    }
    await this.context.globalState.update("SenseCode.tokenRefreshed", quite);
    this.context.secrets.store("SenseCode.tokens", JSON.stringify(authinfos));
  }

  private async checkSensetimeEnv(proxyReady: boolean): Promise<void> {
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

  public clear(): void {
    let logoutAct: Promise<void>[] = [];
    for (let e in this._clients) {
      let ca = this._clients[e];
      if (ca.authInfo) {
        logoutAct.push(
          ca.client.logout(ca.authInfo).then((logoutUrl) => {
            if (logoutUrl) {
              commands.executeCommand("vscode.open", logoutUrl);
            }
            if (ca) {
              ca.authInfo = undefined;
            }
          }, (err) => {
            outlog.debug(`Logout ${e} failed: ${err}`);
          })
        );
      }
    }
    Promise.all(logoutAct).then(() => {
      this.clearStatusData();
    }, () => {
      this.clearStatusData();
    });
  }

  private clearStatusData(): void {
    deleteAllCacheFiles(this.context);
    this.resetAllCacheData();
    this.updateEngineList();
  }

  private async resetAllCacheData() {
    await this.context.globalState.update("privacy", undefined);
    await this.context.globalState.update("ActiveClient", undefined);
    await this.context.globalState.update("CompletionAutomatically", undefined);
    await this.context.globalState.update("CompletionPreference", undefined);
    await this.context.globalState.update("StreamResponse", undefined);
    await this.context.globalState.update("Candidates", undefined);
    await this.context.globalState.update("Delay", undefined);
    await this.configuration.update("Prompt", undefined, true);
    await this.context.secrets.delete("SenseCode.tokens");
  }

  public update(): void {
    this.configuration = workspace.getConfiguration("SenseCode", undefined);
  }

  public get devConfig(): any {
    return this.configuration.get("Dev");
  }

  public async updateEngineList(): Promise<void> {
    return this.getProxy().then((ext) => {
      return this.buildAllClient(ext);
    });
  }

  private getClient(client?: string): ClientAndAuthInfo | undefined {
    if (!client) {
      return undefined;
    }
    for (let e in this._clients) {
      if (e === client) {
        return this._clients[e];
      }
    }
  }

  private getActiveClient(): ClientAndAuthInfo | undefined {
    let ae = this.context.globalState.get<string>("ActiveClient");
    let ac = this.getClient(ae);
    if (!ac) {
      for (let e in this._clients) {
        return this._clients[e];
      }
    } else {
      return ac;
    }
  }

  public getActiveClientLabel(): string | undefined {
    return this.getActiveClient()?.client.label;
  }

  public async setActiveClient(clientName: string | undefined) {
    let originClientState = this.context.globalState.get<string>("ActiveClient");
    if (originClientState !== clientName) {
      await this.context.globalState.update("ActiveClient", clientName);
    }
  }

  public isClientLoggedin(clientName?: string) {
    let ca: ClientAndAuthInfo | undefined = this.getActiveClient();
    if (clientName) {
      ca = this.getClient(clientName);
    }
    return (ca && ca.authInfo);
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
    let es = this.configuration.get<ClientConfig[]>("Engines", []);
    return builtinEngines.concat(es).map((v, _idx, _arr) => {
      return v.label;
    });
  }

  public userId(clientName?: string): string | undefined {
    let ca: ClientAndAuthInfo | undefined = this.getActiveClient();
    if (clientName) {
      ca = this.getClient(clientName);
    }
    if (ca && ca.authInfo) {
      return ca.authInfo.account.userId;
    }
  }

  public username(clientName?: string): string | undefined {
    let ca: ClientAndAuthInfo | undefined = this.getActiveClient();
    if (clientName) {
      ca = this.getClient(clientName);
    }
    if (ca && ca.client) {
      return ca.authInfo?.account.username;
    }
  }

  public avatar(clientName?: string): string | undefined {
    let ca: ClientAndAuthInfo | undefined = this.getActiveClient();
    if (clientName) {
      ca = this.getClient(clientName);
    }
    if (ca) {
      return ca.authInfo?.account.avatar;
    }
  }

  public async getAuthUrlLogin(clientName?: string): Promise<string> {
    let ca: ClientAndAuthInfo | undefined = this.getActiveClient();
    if (clientName) {
      ca = this.getClient(clientName);
    }
    if (ca) {
      if (env.uiKind === UIKind.Web) {
        return Promise.resolve("command:sensecode.setAccessKey");
      }
      let verifier = this.seed;
      verifier += env.machineId;
      return ca.client.getAuthUrlLogin(verifier).then((url) => {
        return url ?? "command:sensecode.setAccessKey";
      });
    } else {
      return Promise.reject();
    }
  }

  public getTokenFromLoginResult(callbackUrl: string, clientName?: string): Thenable<boolean> {
    let ca: ClientAndAuthInfo | undefined = this.getActiveClient();
    if (clientName) {
      ca = this.getClient(clientName);
    }

    return window.withProgress({
      location: { viewId: "sensecode.view" }
    }, async (progress, _cancel) => {
      if (!ca) {
        return false;
      }
      let verifier = this.seed;
      this.seed = this.randomUUID();
      verifier += env.machineId;
      return ca.client.login(callbackUrl, verifier).then(async (token) => {
        progress.report({ increment: 100 });
        if (ca && token) {
          this.updateToken(ca.client.label, token);
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
      let ca: ClientAndAuthInfo | undefined = this.getActiveClient();
      if (clientName) {
        ca = this.getClient(clientName);
      }
      if (ca && ca.authInfo) {
        await ca.client.logout(ca.authInfo).then((logoutUrl) => {
          progress.report({ increment: 100 });
          if (logoutUrl) {
            commands.executeCommand("vscode.open", logoutUrl);
          }
          if (ca) {
            this.updateToken(ca.client.label);
          }
        }, (e) => {
          progress.report({ increment: 100 });
          SenseCodeViewProvider.showError(l10n.t(e.message));
        });
      }
    });
  }

  public async getCompletions(config: SenseCodeRequestParam, options?: ClientReqeustOptions, clientName?: string): Promise<ResponseData> {
    let ca: ClientAndAuthInfo | undefined = this.getActiveClient();
    if (clientName) {
      ca = this.getClient(clientName);
    }
    if (ca && ca.authInfo) {
      let params: ChatRequestParam = {
        model: "",
        ...config
      };
      return ca.client.getCompletions(ca.authInfo, params, options);
    } else if (ca) {
      return Promise.reject(Error(l10n.t("Unauthorized")));
    } else {
      return Promise.reject(Error("Invalid client handle"));
    }
  }

  public async getCompletionsStreaming(config: SenseCodeRequestParam, callback: (event: MessageEvent<ResponseData>) => void, options?: ClientReqeustOptions, clientName?: string) {
    let ca: ClientAndAuthInfo | undefined = this.getActiveClient();
    if (clientName) {
      ca = this.getClient(clientName);
    }
    if (ca && ca.authInfo) {
      let params: ChatRequestParam = {
        model: "",
        ...config
      };
      ca.client.getCompletionsStreaming(ca.authInfo, params, callback, options);
    } else if (ca) {
      return Promise.reject(Error(l10n.t("Unauthorized")));
    } else {
      return Promise.reject(Error("Invalid client handle"));
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

  public maxInputTokenNum(clientName?: string): number {
    let ca: ClientAndAuthInfo | undefined = this.getActiveClient();
    if (clientName) {
      ca = this.getClient(clientName);
    }
    if (ca) {
      return ca.client.maxInputTokenNum;
    }
    return 0;
  }

  public totalTokenNum(clientName?: string): number {
    let ca: ClientAndAuthInfo | undefined = this.getActiveClient();
    if (clientName) {
      ca = this.getClient(clientName);
    }
    if (ca) {
      return ca.client.totalTokenNum;
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