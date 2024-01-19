import { commands, env, ExtensionContext, l10n, UIKind, window, workspace, WorkspaceConfiguration, EventEmitter, Uri } from "vscode";
import { AuthInfo, AuthMethod, ChatRequestParam, ClientReqeustOptions, ClientType, CodeClient, FinishReason, ResponseData, ResponseEvent, Role, ToolType } from "../raccoonClient/src/CodeClient";
import { SenseNovaClient } from "../raccoonClient/src/sensenova-client";
import { extensionNameCamel, extensionNameKebab, outlog, raccoonManager, registerCommand } from "../globalEnv";
import { builtinPrompts, RaccoonPrompt } from "./promptTemplates";
import { PromptType } from "./promptTemplates";
import { randomBytes } from "crypto";
import { OpenAIClient } from "../raccoonClient/src/openai-client";
import { TGIClient } from "../raccoonClient/src/tgi-client";
import { GitUtils } from "../utils/gitUtils";
import { Repository } from "../utils/git";
import { buildHeader } from "../utils/buildRequestHeader";
import { ClientOption, ModelCapacity, RaccoonClientConfig, builtinEngines } from "./contants";

export type RaccoonRequestParam = Pick<ChatRequestParam, "messages" | "n" | "maxNewTokenNum" | "stop" | "tools" | "toolChoice">;

export enum CompletionPreferenceType {
  signleLine = "Signle Line",
  balanced = "Balanced",
  bestEffort = "Best Effort"
}

interface ClientAndAuthInfo {
  client: CodeClient;
  options: { [key in ModelCapacity]?: ClientOption };
  authInfo?: AuthInfo;
}

type ChangeScope = "prompt" | "engines" | "active" | "authorization" | "config";

export interface StatusChangeEvent {
  scope: ChangeScope[];
  quiet?: boolean;
}

export class RaccoonManager {
  protected static instance: RaccoonManager | undefined = undefined;

  private seed: string = this.randomUUID();
  private configuration: WorkspaceConfiguration;
  private _clients: { [key: string]: ClientAndAuthInfo } = {};
  private changeStatusEmitter = new EventEmitter<StatusChangeEvent>();
  public onDidChangeStatus = this.changeStatusEmitter.event;

  private static abortCtrller: { [key: string]: AbortController } = {};

  private randomUUID(): string {
    return randomBytes(20).toString('hex');
  }

  public static getInstance(context: ExtensionContext): RaccoonManager {
    function commitMessageByLLM(rm: RaccoonManager, changes: string, targetRepo: Repository, abortCtrller: AbortController): Promise<void> {
      targetRepo.inputBox.value = '';
      return rm.getCompletionsStreaming(
        ModelCapacity.assistant,
        {
          messages: [{ role: Role.user, content: `Here are changes of current codebase:\n\n\`\`\`diff\n${changes}\n\`\`\`\n\nWrite a commit message summarizing these changes, not have to cover erevything, key-points only. Response the content only, limited the message to 50 characters, in plain text format, and without quotation marks.` }],
          n: 1
        },
        (e: any) => {
          if (e.type === ResponseEvent.error) {
            window.showErrorMessage(e.data?.choices[0]?.message?.content, l10n.t("Close"));
            abortCtrller.abort();
          } else if (e.type === ResponseEvent.data) {
            let cmtmsg = e.data?.choices[0]?.message?.content;
            if (cmtmsg && targetRepo) {
              targetRepo.inputBox.value += cmtmsg;
            }
          } else if (e.type === ResponseEvent.cancel) {
            abortCtrller.abort();
          }
        },
        {
          headers: buildHeader(context.extension, "commit-message", `${new Date().valueOf()}`),
          signal: abortCtrller.signal
        }
      ).catch(e => {
        window.showErrorMessage(e.message, l10n.t("Close"));
      });
    }

    function commitMessageByFunctionCall(rm: RaccoonManager, changes: string, targetRepo: Repository, abortCtrller: AbortController): Promise<void> {
      targetRepo.inputBox.value = '';
      return rm.getCompletions(
        ModelCapacity.agent,
        {
          messages: [{ role: Role.user, content: `Here are changes of current codebase:\n\n\`\`\`diff\n${changes}\n\`\`\`\n\nWrite a commit message summarizing these changes and fill it into submit input text filed, not have to cover erevything, key-points only, limited the message up to 50 characters.` }],
          tools: [{
            type: ToolType.function,
            function: {
              name: "fillCommitMessage",
              description: "fill commit message to submit input text filed",
              parameters: {
                type: "object",
                properties: {
                  message: {
                    type: "string",
                    description: "commit message"
                  }
                }
              }
            }
          }],
          toolChoice: { mode: "auto" },
          n: 1
        },
        {
          headers: buildHeader(context.extension, "commit-message", `${new Date().valueOf()}`),
          signal: abortCtrller.signal
        }
      ).then((data?: ResponseData) => {
        if (!data || !data.choices[0] || data.choices[0].finishReason !== FinishReason.toolCalls) {
          return;
        }
        const fx: { [key: string]: any } = {
          'fillCommitMessage': (result: { message: string }) => {
            targetRepo!.inputBox.value = result.message;
          }
        };
        if (data.choices[0] && data.choices[0].toolCalls) {
          let tc = data.choices[0].toolCalls[0];
          fx[tc.function.name](JSON.parse(tc.function.arguments));
        }
      }, (reason) => {
        if (reason && reason.name !== 'CanceledError') {
          window.showErrorMessage(JSON.stringify(reason.response.data), l10n.t("Close"));
          abortCtrller.abort();
        }
      }).catch(e => {
        window.showErrorMessage(e.message, l10n.t("Close"));
      });
    }

    if (!RaccoonManager.instance) {
      RaccoonManager.instance = new RaccoonManager(context);
      registerCommand(context, "commit-msg", async (...args: any[]) => {
        let gitApi = GitUtils.getInstance().api;
        if (!RaccoonManager.instance || !gitApi) {
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
        if (RaccoonManager.abortCtrller[targetRepo.rootUri.toString()] && !RaccoonManager.abortCtrller[targetRepo.rootUri.toString()].signal.aborted) {
          RaccoonManager.abortCtrller[targetRepo.rootUri.toString()].abort();
          return;
        }
        changes = await targetRepo.diff(true) || await targetRepo.diff();
        if (changes) {
          if (raccoonManager.getModelCapacites().includes(ModelCapacity.agent)) {
            let ac = new AbortController();
            RaccoonManager.abortCtrller[targetRepo.rootUri.toString()] = ac;
            commitMessageByFunctionCall(RaccoonManager.instance, changes, targetRepo, ac);
          } else if (raccoonManager.getModelCapacites().includes(ModelCapacity.assistant)) {
            let ac = new AbortController();
            RaccoonManager.abortCtrller[targetRepo.rootUri.toString()] = ac;
            commitMessageByLLM(RaccoonManager.instance, changes, targetRepo, ac);
          } else {
            window.showErrorMessage("Model capacity not supported yet", l10n.t("Close"));
          }
          delete RaccoonManager.abortCtrller[targetRepo!.rootUri.toString()];
        } else {
          window.showErrorMessage("There's no any change in stage to commit", l10n.t("Close"));
        }
      });
    }
    return RaccoonManager.instance;
  }

  private constructor(private readonly context: ExtensionContext) {
    let flag = `${context.extension.id}-${context.extension.packageJSON.version}`;

    outlog.debug(`------------------- ${flag} -------------------`);

    this.configuration = workspace.getConfiguration(extensionNameCamel, undefined);
    let ret = context.globalState.get<boolean>(flag);
    if (!ret) {
      //outlog.debug('Clear settings');
      //this.resetAllCacheData();
      context.globalState.update(flag, true);
    }
    context.subscriptions.push(
      workspace.onDidChangeConfiguration(async (e) => {
        if (e.affectsConfiguration(extensionNameCamel)) {
          this.update();
          if (e.affectsConfiguration(`${extensionNameCamel}.Prompt`)) {
            this.changeStatusEmitter.fire({ scope: ["prompt"] });
          }
          if (e.affectsConfiguration(`${extensionNameCamel}.Engines`)) {
            this.initialClients().then(() => {
              this.changeStatusEmitter.fire({ scope: ["engines"] });
            });
          }
        }
      })
    );
    context.secrets.onDidChange((e) => {
      if (e.key === `${extensionNameCamel}.tokens`) {
        context.secrets.get(`${extensionNameCamel}.tokens`).then((tks) => {
          if (tks) {
            try {
              let authinfos: { [key: string]: AuthInfo } = JSON.parse(tks);
              let quiet = true;
              let activeClientName = this.getActiveClientRobotName();
              for (let c in this._clients) {
                let ca = this._clients[c];
                if (ca) {
                  if (ca.client.robotName === activeClientName) {
                    if ((!ca.authInfo && authinfos[c]) || (ca.authInfo && !authinfos[c])) {
                      quiet = false;
                    }
                  }
                  ca.authInfo = authinfos[c];
                }
              }
              this.changeStatusEmitter.fire({ scope: ["authorization"], quiet });
            } catch (_e) { }
          }
        });
      }
    });
  }

  public async initialClients(): Promise<void> {
    let tks = await this.context.secrets.get(`${extensionNameCamel}.tokens`);
    let authinfos: any = {};
    if (tks) {
      try {
        authinfos = JSON.parse(tks);
      } catch (e) { }
    }
    let es = this.configuration.get<RaccoonClientConfig[]>("Engines", []);
    es = builtinEngines.concat(es);
    this._clients = {};
    for (let e of es) {
      if (e.type && e.robotname) {
        let client;
        if (e.type === ClientType.sensenova) {
          client = new SenseNovaClient(e, outlog.debug);
        } else if (e.type === ClientType.openai) {
          client = new OpenAIClient(e, outlog.debug);
        } else if (e.type === ClientType.tgi) {
          client = new TGIClient(e, outlog.debug);
        }
        if (client) {
          client.onDidChangeAuthInfo(async (ai) => {
            await this.updateToken(e.robotname, ai);
          });
          if (authinfos[e.robotname]) {
            authinfos[e.robotname].account = await client.syncUserInfo(authinfos[e.robotname]);
          }
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
      return this.updateToken(name, c.authInfo);
    }

    let url = await c.client.getAuthUrlLogin("");
    if (url && Uri.parse(url).scheme === 'authorization' && !c.authInfo) {
      return c.client.login(url, "").then((ai) => {
        if (username) {
          ai.account.username = username;
        }
        return this.updateToken(name, ai);
      }, (_err) => {
        return undefined;
      });
    } else {
      outlog.debug(`Append client ${name} [Unauthorized]`);
      return Promise.resolve();
    }
  }

  private async updateToken(clientName: string, ai?: AuthInfo) {
    let tks = await this.context.secrets.get(`${extensionNameCamel}.tokens`);
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
    if (ai) {
      outlog.debug(`Append client ${clientName}: [Authorized - ${ai.account.username}]`);
    } else {
      outlog.debug(`Remove client ${clientName}`);
    }
    return this.context.secrets.store(`${extensionNameCamel}.tokens`, JSON.stringify(authinfos));
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

    await this.context.secrets.delete(`${extensionNameCamel}.tokens`);
    this.changeStatusEmitter.fire({ scope: ["authorization", "active", "engines", "prompt", "config"] });
  }

  public update(): void {
    this.configuration = workspace.getConfiguration(`${extensionNameCamel}`, undefined);
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

  public get prompt(): RaccoonPrompt[] {
    let customPrompts: { [key: string]: string | any } = this.configuration.get("Prompt", {});
    let prompts: RaccoonPrompt[] = JSON.parse(JSON.stringify(builtinPrompts));
    for (let label in customPrompts) {
      if (typeof customPrompts[label] === 'string') {
        prompts.push(RaccoonManager.parseStringPrompt(label, customPrompts[label] as string));
      } else {
        let p: RaccoonPrompt = {
          label: label,
          type: PromptType.customPrompt,
          icon: customPrompts[label].icon,
          shortcut: customPrompts[label].shortcut,
          origin: customPrompts[label].origin,
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
        p.inputRequired = true;
      }
    }
    return prompts;
  }

  public static parseStringPrompt(label: string, prompt: string, shortcut?: string): RaccoonPrompt {
    let promptProcessed = prompt;
    let regex = /(\{\{)input(:.*?)?(\}\})/g;
    let m;
    let args: any = {};
    while ((m = regex.exec(prompt)) !== null) {
      if (m.index === regex.lastIndex) {
        regex.lastIndex++;
      }
      let placeholder;
      if (m.length > 2 && m[2]) {
        placeholder = m[2].slice(1);
      }
      promptProcessed = promptProcessed.replace(m[0], `{{v${m.index}}}`);
      args[`v${m.index}`] = {
        type: "text",
        placeholder
      };
    }
    return {
      label,
      type: PromptType.customPrompt,
      shortcut,
      origin: prompt,
      message: {
        role: Role.user,
        content: `${promptProcessed}`
      },
      args
    };
  }

  public get robotNames(): string[] {
    let es = this.configuration.get<RaccoonClientConfig[]>("Engines", []);
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
        let prefixCursor = '';
        let _prefixLines = _prefix.split('\n') || [];
        if (_prefixLines.length > 0) {
          prefixCursor = _prefixLines[_prefixLines.length - 1];
          delete _prefixLines[_prefixLines.length - 1];
          prefixLines = _prefixLines.join('\n');
        }
        let suffixLines = '';
        let suffixCursor = '';
        let _suffixLines = _suffix.split('\n') || [];
        if (_suffixLines.length > 0) {
          suffixCursor = _suffixLines[0];
          delete _suffixLines[0];
          suffixLines = _suffixLines.join('\n');
        }
        return ca.options[capacity]!.template
          .replace("[languageid]", language)
          .replace("[prefix]", _prefix)
          .replace("[suffix]", _suffix)
          .replace("[prefix.lines]", prefixLines)
          .replace("[suffix.lines]", suffixLines)
          .replace("[prefix.cursor]", prefixCursor)
          .replace("[suffix.cursor]", suffixCursor);
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
      if (authMethods.includes(AuthMethod.password)) {
        return Promise.resolve(`command:${extensionNameKebab}.password`);
      } else if (authMethods.includes(AuthMethod.accesskey)) {
        return Promise.resolve(`command:${extensionNameKebab}.setAccessKey`);
      } else if (authMethods.includes(AuthMethod.apikey)) {
        return Promise.resolve(`command:${extensionNameKebab}.setApiKey`);
      } else {
        return Promise.reject();
      }
    } else {
      return Promise.reject();
    }
  }

  public getTokenFromLoginResult(callbackUrl: string, clientName?: string): Thenable<'ok' | Error> {
    let ca: ClientAndAuthInfo | undefined = this.getActiveClient();
    if (clientName) {
      ca = this.getClient(clientName);
    }

    return window.withProgress({
      location: { viewId: `${extensionNameKebab}.view` }
    }, async (progress, _cancel) => {
      if (!ca) {
        return new Error("Invalid Client Handler");
      }
      let verifier = this.seed;
      this.seed = this.randomUUID();
      verifier += env.machineId;
      return ca.client.login(callbackUrl, verifier).then(async (token) => {
        progress.report({ increment: 100 });
        if (ca && token) {
          this.updateToken(ca.client.robotName, token);
          return 'ok';
        } else {
          return new Error("Wrong username or password");
        }
      }, (err) => {
        return new Error(err.response?.data?.details || err.message);
      });
    });
  }

  public async logout(clientName?: string) {
    return window.withProgress({
      location: { viewId: `${extensionNameKebab}.view` }
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
        }, () => {
          progress.report({ increment: 100 });
          if (ca) {
            this.updateToken(ca.client.robotName);
          }
        });
      }
    });
  }

  public getModelCapacites(clientName?: string): ModelCapacity[] {
    let es = this.configuration.get<RaccoonClientConfig[]>("Engines", []);
    if (!clientName) {
      clientName = this.getActiveClientRobotName();
    }
    if (!clientName) {
      return [];
    }
    let cfg = builtinEngines.concat(es).filter((v, _idx, _arr) => v.robotname === clientName);
    if (cfg.length === 0) {
      return [];
    }
    let mc: ModelCapacity[] = [];
    for (let k in cfg[0]) {
      if ((Object).values(ModelCapacity).includes(k as ModelCapacity)) {
        mc.push(k as ModelCapacity);
      }
    }
    return mc;
  }

  public async getCompletions(capacity: ModelCapacity, config: RaccoonRequestParam, options?: ClientReqeustOptions, clientName?: string): Promise<ResponseData> {
    let ca: ClientAndAuthInfo | undefined = this.getActiveClient();
    if (clientName) {
      ca = this.getClient(clientName);
    }
    if (ca && ca.authInfo && ca.options[capacity]) {
      let params: ChatRequestParam = {
        url: ca.options[capacity]!.url,
        ...ca.options[capacity]!.parameters,
        ...config
      };
      let useridInfo;
      if (ca.authInfo.account.userId) {
        // eslint-disable-next-line @typescript-eslint/naming-convention
        useridInfo = { "x-raccoon-user-id": ca.authInfo.account.userId };
      }
      if (!options) {
        options = { headers: useridInfo };
      } else if (!options.headers) {
        options.headers = useridInfo;
      } else {
        options.headers = { ...options.headers, ...useridInfo };
      }
      return ca.client.getCompletions(ca.authInfo, params, options).catch(e => {
        if (e.response?.status === 401) {
          this.updateToken(ca!.client.robotName);
        }
        return Promise.reject(e);
      });
    } else if (ca) {
      return Promise.reject(Error(l10n.t("Unauthorized")));
    } else {
      return Promise.reject(Error("Invalid client handle"));
    }
  }

  public async getCompletionsStreaming(capacity: ModelCapacity, config: RaccoonRequestParam, callback: (event: MessageEvent<ResponseData>) => void, options?: ClientReqeustOptions, clientName?: string) {
    let ca: ClientAndAuthInfo | undefined = this.getActiveClient();
    if (clientName) {
      ca = this.getClient(clientName);
    }
    if (ca && ca.authInfo && ca.options[capacity]) {
      let params: ChatRequestParam = {
        url: ca.options[capacity]!.url,
        ...ca.options[capacity]!.parameters,
        ...config
      };
      let resetToken = this.updateToken.bind(this);
      let cb = function (event: MessageEvent<ResponseData>) {
        if (event.type === ResponseEvent.error && event.data.choices[0].message?.content === "Unauthorized") {
          resetToken(ca!.client.robotName);
        }
        callback(event);
      };
      let useridInfo;
      if (ca.authInfo.account.userId) {
        // eslint-disable-next-line @typescript-eslint/naming-convention
        useridInfo = { "x-raccoon-user-id": ca.authInfo.account.userId };
      }
      if (!options) {
        options = { headers: useridInfo };
      } else if (!options.headers) {
        options.headers = useridInfo;
      } else {
        options.headers = { ...options.headers, ...useridInfo };
      }
      ca.client.getCompletionsStreaming(ca.authInfo, params, cb, options);
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
    return this.context.globalState.get("CompletionPreference", CompletionPreferenceType.signleLine);
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
      return ca.options[capacity]?.maxInputTokenNum || 0;
    }
    return 0;
  }

  public totalTokenNum(capacity: ModelCapacity, clientName?: string): number {
    let ca: ClientAndAuthInfo | undefined = this.getActiveClient();
    if (clientName) {
      ca = this.getClient(clientName);
    }
    if (ca) {
      return ca.options[capacity]?.totalTokenNum || 0;
    }
    return 0;
  }

  public get delay(): number {
    return this.context.globalState.get("Delay", 1);
  }

  public set delay(v: number) {
    this.context.globalState.update("Delay", v).then(() => {
      this.changeStatusEmitter.fire({ scope: ["config"] });
    });
  }
}