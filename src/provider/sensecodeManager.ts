import { commands, env, ExtensionContext, l10n, UIKind, window, workspace, WorkspaceConfiguration, EventEmitter, Uri } from "vscode";
import { AuthInfo, AuthMethod, ChatRequestParam, ClientConfig, ClientReqeustOptions, ClientType, CodeClient, ResponseData, ResponseEvent, Role } from "../sensecodeClient/src/CodeClient";
import { SenseCodeClientMeta, SenseCodeClient } from "../sensecodeClient/src/sensecode-client";
import { SenseNovaClient, SenseNovaClientMeta } from "../sensecodeClient/src/sensenova-client";
import { outlog } from "../extension";
import { builtinPrompts, SenseCodePrompt } from "./promptTemplates";
import { PromptType } from "./promptTemplates";
import { randomBytes } from "crypto";
import { OpenAIClient } from "../sensecodeClient/src/openai-client";
import { checkSensetimeEnv } from "../utils/getProxy";
import { TGIClient } from "../sensecodeClient/src/tgi-client";
import { GitUtils } from "../utils/gitUtils";
import { Repository } from "../utils/git";
import { buildHeader } from "../utils/buildRequestHeader";

export enum ModelCapacity {
  assistant = "assistant",
  completion = "completion"
}

export interface ClientOption {
  url: string;
  template: string;
  parameters: any;
  maxInputTokenNum: number;
  totalTokenNum: number;
}

type SensecodeClientConfig = ClientConfig & {
  [key in ModelCapacity]: ClientOption;
};

const builtinEngines: SensecodeClientConfig[] = [
  {
    type: ClientType.sensenova,
    robotname: "SenseCode",
    completion: {
      url: "https://api.sensenova.cn/v1/llm/completions",
      template: "<LANG>[languageid]<SUF>[suffix.lines]<PRE>[prefix.lines]<MID>[prefix.cursor]",
      parameters: {
        model: "nova-ptc-s-v1-codecompletion",
        stop: [
          "<|EOT|>"
        ],
        temperature: 1.0
      },
      maxInputTokenNum: 6144,
      totalTokenNum: 8192
    },
    assistant: {
      url: "https://api.sensenova.cn/v1/llm/chat-completions",
      template: "[prefix]",
      parameters: {
        model: "nova-ptc-l-v1-code",
        stop: [
          "<|endofmessage|>"
        ],
        temperature: 1.0
      },
      maxInputTokenNum: 6144,
      totalTokenNum: 8192
    }
  }
];

type SenseCodeRequestParam = Pick<ChatRequestParam, "messages" | "n" | "maxNewTokenNum">;

export enum CompletionPreferenceType {
  speedPriority = "Speed Priority",
  balanced = "Balanced",
  bestEffort = "Best Effort"
}

interface ClientAndAuthInfo {
  client: CodeClient;
  options: { [key in ModelCapacity]: ClientOption };
  authInfo?: AuthInfo;
}

type ChangeScope = "prompt" | "engines" | "active" | "authorization" | "config";

export interface StatusChangeEvent {
  scope: ChangeScope[];
  quiet?: boolean;
}

export class SenseCodeManager {
  protected static instance: SenseCodeManager | undefined = undefined;

  private seed: string = this.randomUUID();
  private configuration: WorkspaceConfiguration;
  private _clients: { [key: string]: ClientAndAuthInfo } = {};
  private sensetimeEnv?: boolean;
  private changeStatusEmitter = new EventEmitter<StatusChangeEvent>();
  public onDidChangeStatus = this.changeStatusEmitter.event;

  private static abortCtrller: { [key: string]: AbortController } = {};

  private randomUUID(): string {
    return randomBytes(20).toString('hex');
  }

  public static getInstance(context: ExtensionContext): SenseCodeManager {
    if (!SenseCodeManager.instance) {
      SenseCodeManager.instance = new SenseCodeManager(context);
      context.subscriptions.push(commands.registerCommand("sensecode.commit-msg", async (...args: any[]) => {
        let gitApi = GitUtils.getInstance().api;
        if (!gitApi) {
          return;
        }
        let changes = '';
        let targetRepo: Repository | null | undefined = undefined;
        if (args[0] && args[0].rootUri) {
          targetRepo = gitApi.getRepository(args[0].rootUri);
        }
        if (!targetRepo) {
          if (gitApi.repositories.length === 1) {
            targetRepo = gitApi.repositories[0];
          } else if (gitApi.repositories.length > 1) {
            let rps = gitApi.repositories.map((repo, _idx, _arr) => {
              return repo.rootUri.toString();
            });
            let rpUri = await window.showQuickPick(rps);
            if (rpUri) {
              targetRepo = gitApi.getRepository(Uri.parse(rpUri));
            }
          }
        }
        if (!targetRepo) {
          window.showErrorMessage("No repository found", l10n.t("Close"));
          return;
        }
        if (SenseCodeManager.abortCtrller[targetRepo.rootUri.toString()] && !SenseCodeManager.abortCtrller[targetRepo.rootUri.toString()].signal.aborted) {
          SenseCodeManager.abortCtrller[targetRepo.rootUri.toString()].abort();
          return;
        }
        changes = await targetRepo.diff(true) || await targetRepo.diff();
        if (changes) {
          targetRepo.inputBox.value = '';
          SenseCodeManager.abortCtrller[targetRepo.rootUri.toString()] = new AbortController();
          return SenseCodeManager.instance?.getCompletionsStreaming(
            ModelCapacity.assistant,
            {
              messages: [{ role: Role.user, content: `Write a commit message summarizing following changes to the codebase, limited to 50 characters, and without quotation marks:\n\`\`\`diff\n${changes}\n\`\`\`` }],
              n: 1
            },
            (e: any) => {
              if (e.type === ResponseEvent.error) {
                SenseCodeManager.abortCtrller[targetRepo!.rootUri.toString()].abort();
                delete SenseCodeManager.abortCtrller[targetRepo!.rootUri.toString()];
              } else if (e.type === ResponseEvent.data) {
                let cmtmsg = e.data?.choices[0]?.message?.content;
                if (cmtmsg && targetRepo) {
                  targetRepo.inputBox.value += cmtmsg;
                }
              } else if (e.type === ResponseEvent.done || e.type === ResponseEvent.finish) {
                delete SenseCodeManager.abortCtrller[targetRepo!.rootUri.toString()];
              } else {
                SenseCodeManager.abortCtrller[targetRepo!.rootUri.toString()].abort();
              }
            },
            {
              headers: buildHeader(context.extension, "commit-message"),
              signal: SenseCodeManager.abortCtrller[targetRepo.rootUri.toString()].signal
            }
          ).catch(e => {
            window.showErrorMessage(e.message, l10n.t("Close"));
          });
        } else {
          window.showErrorMessage("There's no any change in stage to commit", l10n.t("Close"));
        }
      }));
    }
    return SenseCodeManager.instance;
  }

  private constructor(private readonly context: ExtensionContext) {
    let flag = `${context.extension.id}-${context.extension.packageJSON.version}`;

    outlog.debug(`------------------- ${flag} -------------------`);

    checkSensetimeEnv().then((v) => {
      this.sensetimeEnv = v;
    });

    this.configuration = workspace.getConfiguration("SenseCode", undefined);
    let ret = context.globalState.get<boolean>(flag);
    if (!ret) {
      //outlog.debug('Clear settings');
      //this.resetAllCacheData();
      context.globalState.update(flag, true);
    }
    context.subscriptions.push(
      workspace.onDidChangeConfiguration(async (e) => {
        if (e.affectsConfiguration("SenseCode")) {
          this.update();
          if (e.affectsConfiguration("SenseCode.Prompt")) {
            this.changeStatusEmitter.fire({ scope: ["prompt"] });
          }
          if (e.affectsConfiguration("SenseCode.Engines")) {
            this.initialClients().then(() => {
              this.changeStatusEmitter.fire({ scope: ["engines"] });
            });
          }
        }
      })
    );
  }

  public async initialClients(): Promise<void> {
    let tks = await this.context.secrets.get("SenseCode.tokens");
    let authinfos: any = {};
    if (tks) {
      try {
        authinfos = JSON.parse(tks);
      } catch (e) { }
    }
    let es = this.configuration.get<SensecodeClientConfig[]>("Engines", []);
    es = builtinEngines.concat(es);
    this._clients = {};
    for (let e of es) {
      if (e.type && e.robotname) {
        let client;
        if (e.type === ClientType.sensenova) {
          const meta: SenseNovaClientMeta = {
            //clientId: "f757d86437a67267b9a5",
            //secret: "6777e90c9e4edda49a6144c456ff5b4a765752ef",
            clientId: "sensecode-vscode",
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
        } else if (e.type === ClientType.tgi) {
          client = new TGIClient(e, outlog.debug);
        }
        if (client) {
          client.onDidChangeAuthInfo(async (ai) => {
            await this.updateToken(e.robotname, ai, true);
          });
          await this.appendClient(e.robotname, { client, options: e, authInfo: authinfos[e.robotname] }, e.username);
        }
      }
    }
  }

  private async appendClient(name: string, c: ClientAndAuthInfo, username?: string) {
    this._clients[name] = c;
    if (c.authInfo) {
      if (username) {
        c.authInfo.account.username = username;
      }
      return this.updateToken(name, c.authInfo, true);
    }

    let url = await c.client.getAuthUrlLogin("");
    if (url && Uri.parse(url).scheme === 'authorization' && !c.authInfo) {
      return c.client.login(url, "").then((ai) => {
        if (username) {
          ai.account.username = username;
        }
        return this.updateToken(name, ai, true);
      });
    } else {
      outlog.debug(`Append client ${name} [Unauthorized]`);
      return Promise.resolve();
    }
  }

  private async updateToken(clientName: string, ai?: AuthInfo, quiet?: boolean) {
    let tks = await this.context.secrets.get("SenseCode.tokens");
    let authinfos: { [key: string]: AuthInfo } = {};
    if (tks) {
      try {
        authinfos = JSON.parse(tks);
        if (ai) {
          authinfos[clientName] = ai;
        } else {
          delete authinfos[clientName];
        }
      } catch (e) { }
    } else if (ai) {
      authinfos[clientName] = ai;
    }
    let ca = this.getClient(clientName);
    if (ca) {
      ca.authInfo = ai;
    }
    if (ai) {
      outlog.debug(`Append client ${clientName}: [Authorized - ${ai.account.username}]`);
    } else {
      outlog.debug(`Remove client ${clientName}`);
    }
    return this.context.secrets.store("SenseCode.tokens", JSON.stringify(authinfos)).then(() => {
      this.changeStatusEmitter.fire({ scope: ["authorization"], quiet });
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
    Promise.all(logoutAct).then(async () => {
      await this.clearStatusData();
    }, async () => {
      await this.clearStatusData();
    });
  }

  private async clearStatusData(): Promise<void> {
    return this.resetAllCacheData().then(() => {
      return this.initialClients();
    });
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
    this.changeStatusEmitter.fire({ scope: ["authorization", "active", "engines", "prompt", "config"] });
  }

  public update(): void {
    this.configuration = workspace.getConfiguration("SenseCode", undefined);
  }

  public get devConfig(): any {
    return this.configuration.get("Dev");
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

  public getActiveClientRobotName(): string | undefined {
    return this.getActiveClient()?.client.robotName;
  }

  public async setActiveClient(clientName: string | undefined) {
    let originClientState = this.context.globalState.get<string>("ActiveClient");
    if (originClientState !== clientName) {
      await this.context.globalState.update("ActiveClient", clientName);
      this.changeStatusEmitter.fire({ scope: ["active"] });
    }
  }

  public isClientLoggedin(clientName?: string) {
    let ca: ClientAndAuthInfo | undefined = this.getActiveClient();
    if (clientName) {
      ca = this.getClient(clientName);
    }
    return (ca && ca.authInfo);
  }

  public isSensetimeEnv(): boolean | undefined {
    return this.sensetimeEnv;
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
          shortcut: customPrompts[label].shortcut,
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

  public get robotNames(): string[] {
    let es = this.configuration.get<SensecodeClientConfig[]>("Engines", []);
    return builtinEngines.concat(es).map((v, _idx, _arr) => {
      return v.robotname;
    });
  }

  public buildFillPrompt(capacity: ModelCapacity, language: string, prefix: string, suffix?: string, clientName?: string): string | undefined {
    let ca: ClientAndAuthInfo | undefined = this.getActiveClient();
    if (clientName) {
      ca = this.getClient(clientName);
    }
    if (ca) {
      if (ca.options[capacity]?.template) {
        let _prefix = prefix.replace(/\r\n/g, '\n');
        let _suffix = suffix?.replace(/\r\n/g, '\n') || "";
        let prefixLines = '';
        let prefixLCursor = '';
        let _prefixLines = _prefix.split('\n');
        if (_prefixLines.length > 0) {
          prefixLCursor = _prefixLines[_prefixLines.length - 1];
          delete _prefixLines[_prefixLines.length - 1];
          prefixLines = _prefixLines.join('\n');
        }
        let suffixLines = '';
        let _suffixLines = _suffix.split('\n') || [];
        if (_suffixLines.length > 0) {
          delete _suffixLines[0];
          suffixLines = _suffixLines.join('\n');
        }
        return ca.options[capacity].template
          .replace("[languageid]", language)
          .replace("[prefix]", _prefix)
          .replace("[suffix]", _suffix)
          .replace("[prefix.lines]", prefixLines)
          .replace("[suffix.lines]", suffixLines)
          .replace("[prefix.cursor]", prefixLCursor);
      }
    }
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

  public async getAuthUrlLogin(clientName?: string): Promise<string | undefined> {
    let ca: ClientAndAuthInfo | undefined = this.getActiveClient();
    if (clientName) {
      ca = this.getClient(clientName);
    }
    if (ca) {
      let authMethods = ca.client.authMethods;
      let verifier = this.seed;
      verifier += env.machineId;
      let url = await ca.client.getAuthUrlLogin(verifier);
      if (url) {
        if (Uri.parse(url).scheme === 'authorization') {
          if (ca.authInfo) {
            return undefined;
          }
          return ca.client.login(url, verifier).then(async (token) => {
            if (ca && token) {
              this.updateToken(ca.client.robotName, token);
            }
            return undefined;
          }, (_err) => {
            return undefined;
          });
        } else {
          if (env.uiKind === UIKind.Desktop && authMethods.includes(AuthMethod.browser)) {
            return url;
          }
        }
      }
      if (authMethods.includes(AuthMethod.accesskey)) {
        return Promise.resolve("command:sensecode.setAccessKey");
      } else if (authMethods.includes(AuthMethod.apikey)) {
        return Promise.resolve("command:sensecode.setApiKey");
      } else {
        return Promise.reject();
      }
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
          this.updateToken(ca.client.robotName, token);
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
            this.updateToken(ca.client.robotName);
          }
        }, (e) => {
          progress.report({ increment: 100 });
          window.showErrorMessage(l10n.t(e.message), l10n.t("Clear Access Key"), l10n.t("Close")).then((v) => {
            if (v === l10n.t("Clear Access Key")) {
              if (ca) {
                this.updateToken(ca.client.robotName);
              }
            }
          });
        });
      }
    });
  }

  public async getCompletions(capacity: ModelCapacity, config: SenseCodeRequestParam, options?: ClientReqeustOptions, clientName?: string): Promise<ResponseData> {
    let ca: ClientAndAuthInfo | undefined = this.getActiveClient();
    if (clientName) {
      ca = this.getClient(clientName);
    }
    if (ca && ca.authInfo && ca.options[capacity]) {
      let params: ChatRequestParam = {
        url: ca.options[capacity].url,
        ...ca.options[capacity].parameters,
        ...config
      };
      return ca.client.getCompletions(ca.authInfo, params, options);
    } else if (ca) {
      return Promise.reject(Error(l10n.t("Unauthorized")));
    } else {
      return Promise.reject(Error("Invalid client handle"));
    }
  }

  public async getCompletionsStreaming(capacity: ModelCapacity, config: SenseCodeRequestParam, callback: (event: MessageEvent<ResponseData>) => void, options?: ClientReqeustOptions, clientName?: string) {
    let ca: ClientAndAuthInfo | undefined = this.getActiveClient();
    if (clientName) {
      ca = this.getClient(clientName);
    }
    if (ca && ca.authInfo && ca.options[capacity]) {
      let params: ChatRequestParam = {
        url: ca.options[capacity].url,
        ...ca.options[capacity].parameters,
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
    this.context.globalState.update("CompletionAutomatically", v).then(() => {
      this.changeStatusEmitter.fire({ scope: ["config"] });
    });
  }

  public get completionPreference(): CompletionPreferenceType {
    return this.context.globalState.get("CompletionPreference", CompletionPreferenceType.speedPriority);
  }

  public set completionPreference(v: CompletionPreferenceType) {
    this.context.globalState.update("CompletionPreference", v).then(() => {
      this.changeStatusEmitter.fire({ scope: ["config"] });
    });
  }

  public get streamResponse(): boolean {
    return this.context.globalState.get("StreamResponse", true);
  }

  public set streamResponse(v: boolean) {
    this.context.globalState.update("StreamResponse", v).then(() => {
      this.changeStatusEmitter.fire({ scope: ["config"] });
    });
  }

  public get candidates(): number {
    return this.context.globalState.get("Candidates", 1);
  }

  public set candidates(v: number) {
    this.context.globalState.update("Candidates", v).then(() => {
      this.changeStatusEmitter.fire({ scope: ["config"] });
    });
  }

  public maxInputTokenNum(capacity: ModelCapacity, clientName?: string): number {
    let ca: ClientAndAuthInfo | undefined = this.getActiveClient();
    if (clientName) {
      ca = this.getClient(clientName);
    }
    if (ca) {
      return ca.options[capacity]?.maxInputTokenNum;
    }
    return 0;
  }

  public totalTokenNum(capacity: ModelCapacity, clientName?: string): number {
    let ca: ClientAndAuthInfo | undefined = this.getActiveClient();
    if (clientName) {
      ca = this.getClient(clientName);
    }
    if (ca) {
      return ca.options[capacity]?.totalTokenNum;
    }
    return 0;
  }

  public get delay(): number {
    return this.context.globalState.get("Delay", 3);
  }

  public set delay(v: number) {
    this.context.globalState.update("Delay", v).then(() => {
      this.changeStatusEmitter.fire({ scope: ["config"] });
    });
  }
}