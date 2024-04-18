import { commands, env, ExtensionContext, l10n, UIKind, window, workspace, WorkspaceConfiguration, EventEmitter, Uri, QuickPickItem, QuickPickItemKind } from "vscode";
import { AuthInfo, AuthMethod, RequestParam, ChatOptions, CodeClient, Role, Message, Choice, CompletionOptions, Organization, AccountInfo, KnowledgeBase, MetricType } from "../raccoonClient/CodeClient";
import { RaccoonClient } from "../raccoonClient/raccoonClinet";
import { extensionNameCamel, extensionNameKebab, outlog, raccoonConfig, raccoonManager, registerCommand, telemetryReporter } from "../globalEnv";
import { builtinPrompts, RaccoonPrompt } from "./promptTemplates";
import { PromptType } from "./promptTemplates";
import { randomBytes } from "crypto";
import { GitUtils } from "../utils/gitUtils";
import { Repository } from "../utils/git";
import { buildHeader } from "../utils/buildRequestHeader";
import { ClientOption, ModelCapacity, RaccoonClientConfig } from "./config";
import { RaccoonAgent, builtinAgents } from "./agentManager";

export type RaccoonRequestParam = Pick<RequestParam, "stream" | "n" | "maxNewTokenNum" | "stop" | "tools" | "toolChoice">;
export type RaccoonRequestCallbacks = Pick<ChatOptions, "thisArg" | "onError" | "onFinish" | "onUpdate" | "onController">;

export enum CompletionPreferenceType {
  singleLine = "Single Line",
  balanced = "Balanced",
  bestEffort = "Best Effort"
}

interface ClientAndAuthInfo {
  client: CodeClient;
  options: { [key in ModelCapacity]?: ClientOption };
  authInfo?: AuthInfo;
}

type ChangeScope = "agent" | "prompt" | "engines" | "active" | "authorization" | "config";
const Individual = "Individual";

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
    function commitMessageByLLM(rm: RaccoonManager, changes: string, targetRepo: Repository): Promise<void> {
      if (RaccoonManager.abortCtrller[targetRepo.rootUri.toString()] && !RaccoonManager.abortCtrller[targetRepo.rootUri.toString()].signal.aborted) {
        RaccoonManager.abortCtrller[targetRepo.rootUri.toString()].abort();
        delete RaccoonManager.abortCtrller[targetRepo!.rootUri.toString()];
      }
      targetRepo.inputBox.value = '';

      // eslint-disable-next-line @typescript-eslint/naming-convention
      telemetryReporter.logUsage(MetricType.commitMessage, { usage_num: 1 });

      return rm.chat(
        [{ role: Role.user, content: `Here are changes of current codebase:\n\n\`\`\`diff\n${changes}\n\`\`\`\n\nWrite a commit message summarizing these changes, not have to cover erevything, key-points only. Response the content only, limited the message to 50 characters, in plain text format, and without quotation marks.` }],
        {
          stream: true,
          n: 1
        },
        {
          onError: (e: Choice) => {
            outlog.error(JSON.stringify(e));
            window.showErrorMessage(e.message?.content || "", l10n.t("Close"));
          },
          onUpdate: (choice: Choice) => {
            let cmtmsg = choice.message?.content;
            if (cmtmsg && targetRepo) {
              targetRepo.inputBox.value += cmtmsg;
            }
          },
          onController(controller) {
            RaccoonManager.abortCtrller[targetRepo.rootUri.toString()] = controller;
          },
        },
        buildHeader(context.extension, "commit-message", `${new Date().valueOf()}`)
      ).catch(e => {
        window.showErrorMessage(e.message, l10n.t("Close"));
      });
    }

    if (!RaccoonManager.instance) {
      RaccoonManager.instance = new RaccoonManager(context);
      registerCommand(context, "commit-msg", async (...args: any[]) => {
        let gitApi = await GitUtils.getInstance().api();
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
        changes = await targetRepo.diff(true) || await targetRepo.diff();
        if (changes) {
          if (raccoonManager.getModelCapacites().includes(ModelCapacity.assistant)) {
            commitMessageByLLM(RaccoonManager.instance, changes, targetRepo);
          } else {
            window.showErrorMessage("Model capacity not supported yet", l10n.t("Close"));
          }
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
      context.globalState.update(flag, true);
    }
    context.subscriptions.push(
      workspace.onDidChangeConfiguration(async (e) => {
        if (e.affectsConfiguration(extensionNameCamel)) {
          this.update();
          if (e.affectsConfiguration(`${extensionNameCamel}.Agent`)) {
            this.notifyStateChange({ scope: ["agent"] });
          }
          if (e.affectsConfiguration(`${extensionNameCamel}.Prompt`)) {
            this.notifyStateChange({ scope: ["prompt"] });
          }
          if (e.affectsConfiguration(`${extensionNameCamel}.Engines`)) {
            this.initialClients().then(() => {
              this.notifyStateChange({ scope: ["engines"] });
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
              this.notifyStateChange({ scope: ["authorization"], quiet });
            } catch (_e) { }
          }
        });
      } else if (e.key === `${extensionNameCamel}.stateUpdated`) {
        this.context.secrets.get(`${extensionNameCamel}.stateUpdated`).then((notify) => {
          if (notify) {
            let ntfy = JSON.parse(notify);
            if (ntfy.sessionId !== env.sessionId) {
              let evt = ntfy.event as StatusChangeEvent;
              evt.scope = evt.scope.filter((v) => v !== "authorization");
              this.changeStatusEmitter.fire(evt);
            }
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
    let es = (<RaccoonClientConfig[]>raccoonConfig.value("engines"));
    this._clients = {};
    for (let e of es) {
      if (e.robotname) {
        let client = new RaccoonClient(e);
        client.setLogger(outlog.debug);
        client.onDidChangeAuthInfo(async (ai) => {
          await this.updateToken(e.robotname, ai);
        });
        if (authinfos[e.robotname]) {
          let account = await client.syncUserInfo(authinfos[e.robotname]);
          authinfos[e.robotname].account = account;
        }
        await this.appendClient(e.robotname, { client, options: e, authInfo: authinfos[e.robotname] }, e.username);
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

  private notifyStateChange(event: StatusChangeEvent) {
    this.changeStatusEmitter.fire(event);
    let timeStamp = new Date().valueOf();
    this.context.secrets.store(`${extensionNameCamel}.stateUpdated`, `${JSON.stringify({ sessionId: env.sessionId, timeStamp, event })}`);
  }

  private async resetAllCacheData() {
    this.context.globalState.keys().forEach(async (v, _idx, _arr) => {
      await this.context.globalState.update(v, undefined);
    });
    await this.configuration.update("Prompt", undefined, true);

    await this.context.secrets.delete(`${extensionNameCamel}.tokens`);
    this.notifyStateChange({ scope: ["authorization", "active", "engines", "agent", "prompt", "config"] });
  }

  public update(): void {
    this.configuration = workspace.getConfiguration(`${extensionNameCamel}`, undefined);
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

  public getActiveClientAuth(): AuthInfo | undefined {
    return this.getActiveClient()?.authInfo;
  }

  public setActiveClient(clientName: string | undefined) {
    let originClientState = this.context.globalState.get<string>("ActiveClient");
    if (originClientState !== clientName) {
      this.context.globalState.update("ActiveClient", clientName).then(() => {
        this.notifyStateChange({ scope: ["active"] });
      });
    }
  }

  public isClientLoggedin() {
    let ca: ClientAndAuthInfo | undefined = this.getActiveClient();
    return (ca && ca.authInfo);
  }

  public get agent(): RaccoonAgent[] {
    let customAgents: { [key: string]: { systemPrompt: string, label: string, icon: string, knowledges: KnowledgeBase[] } } = this.configuration.get("Agent", {});
    let agants: RaccoonAgent[] = [...builtinAgents];
    for (let id in customAgents) {
      agants.push({
        id,
        label: customAgents[id].label,
        icon: customAgents[id].icon,
        systemPrompt: customAgents[id].systemPrompt,
        knowledges: customAgents[id].knowledges
      });
    }
    return agants;
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
    return (<RaccoonClientConfig[]>raccoonConfig.value("engines")).map((v, _idx, _arr) => {
      return v.robotname;
    });
  }

  public buildFillPrompt(capacity: ModelCapacity, language: string, prefix: string, suffix?: string): string | undefined {
    let ca: ClientAndAuthInfo | undefined = this.getActiveClient();
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

  public async userInfo(update: boolean = false, timeout_ms?: number): Promise<AccountInfo | undefined> {
    let ca: ClientAndAuthInfo | undefined = this.getActiveClient();
    if (ca && ca.authInfo) {
      if (update) {
        return ca.client.syncUserInfo(ca.authInfo, timeout_ms).then((account) => {
          if (ca && ca.authInfo) {
            let ai = { ...ca.authInfo, account };
            this.updateToken(ca.client.robotName, ai);
            return account;
          }
        });
      }
      return Promise.resolve(ca.authInfo.account);
    }
    return Promise.resolve(undefined);
  }

  public organizationList(): Organization[] {
    let ca: ClientAndAuthInfo | undefined = this.getActiveClient();
    if (ca && ca.client) {
      return ca.authInfo?.account.organizations || [];
    }
    return [];
  }

  public async setActiveOrganization(orgCode?: string): Promise<void> {
    if (!orgCode) {
      orgCode = Individual;
    }
    let ao = this.context.globalState.get<string>("ActiveOrganization", Individual);
    if (orgCode === ao) {
      return Promise.resolve();
    }
    return this.context.globalState.update("ActiveOrganization", orgCode).then(() => {
      this.notifyStateChange({ scope: ["active"] });
    });
  }

  public activeOrganization(): Organization | undefined {
    let ca: ClientAndAuthInfo | undefined = this.getActiveClient();
    if (ca && ca.client) {
      let orgs = ca.authInfo?.account.organizations;
      let ao = this.context.globalState.get<string>("ActiveOrganization", Individual);
      if (ao === Individual) {
        return undefined;
      }
      if (ao && orgs) {
        for (let org of orgs) {
          if (org.code === ao) {
            return org;
          }
        }
      }
    }
  }

  public async listKnowledgeBase(update?: boolean): Promise<KnowledgeBase[]> {
    let ca: ClientAndAuthInfo | undefined = this.getActiveClient();
    let org: Organization | undefined = this.activeOrganization();
    if (ca && ca.authInfo) {
      let ts = this.context.globalState.get<number>("KnowledgeBasesUpdateAt") || 0;
      let cur_ts = new Date().valueOf();
      if (update || ((cur_ts - ts) > (3600 * 1000))) {
        let kb = await ca.client.listKnowledgeBase(ca.authInfo, org);
        this.context.globalState.update("KnowledgeBases", kb);
        this.context.globalState.update("KnowledgeBasesUpdateAt", cur_ts);
        return Promise.resolve(kb);
      } else {
        return this.context.globalState.get<KnowledgeBase[]>("KnowledgeBases") || [];
      }
    }
    return Promise.resolve([]);
  }

  public async getAuthUrlLogin(): Promise<string | undefined> {
    let ca: ClientAndAuthInfo | undefined = this.getActiveClient();
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

  public getTokenFromLoginResult(callbackUrl: string): Thenable<'ok' | Error> {
    let ca: ClientAndAuthInfo | undefined = this.getActiveClient();

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
          return new Error(l10n.t("Incorrect username or password"));
        }
      }, (err) => {
        return new Error(err.response?.data?.details || err.message);
      });
    });
  }

  public async logout() {
    return window.withProgress({
      location: { viewId: `${extensionNameKebab}.view` }
    }, async (progress, _cancel) => {
      let ca: ClientAndAuthInfo | undefined = this.getActiveClient();
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

  public async switchOrganization() {
    interface OrgInfo extends QuickPickItem {
      id: string
    };
    return window.withProgress({
      location: { viewId: `${extensionNameKebab}.view` }
    }, async (progress, _cancel) => {
      await this.userInfo(true, 3000).then((ac) => {
        let ao = this.activeOrganization();
        let username = ac?.username || "";
        let orgs: OrgInfo[] = this.organizationList()
          .filter((org, _idx, _arr) => org.status === "normal")
          .map((value, _idx, _arr) => {
            let icon = "$(blank)";
            let name = value.username || username;
            if (value.code === ao?.code) {
              icon = `$(check)`;
            }
            return {
              label: `${icon} ${value.name}`,
              description: `@${name}`,
              id: value.code
            }
          });
        let individualItem: OrgInfo = {
          label: ao ? `$(blank) ${l10n.t("Individual")}` : `$(check)  ${l10n.t("Individual")}`,
          description: `@${username}`,
          id: ""
        };
        let separator: OrgInfo = {
          id: "",
          label: "",
          kind: QuickPickItemKind.Separator
        }
        progress.report({ increment: 100 });
        window.showQuickPick<OrgInfo>([individualItem, separator, ...orgs], { canPickMany: false, placeHolder: l10n.t("Select Organization") }).then((select) => {
          if (select) {
            raccoonManager.setActiveOrganization(select.id);
          }
        })
      }).then(() => {
        this.listKnowledgeBase(true);
      })
    });
  }

  public getModelCapacites(): ModelCapacity[] {
    let clientName = this.getActiveClientRobotName();
    if (!clientName) {
      return [];
    }
    let cfg = (<RaccoonClientConfig[]>raccoonConfig.value("engines")).filter((v, _idx, _arr) => v.robotname === clientName);
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

  public async chat(messages: Message[], param: RaccoonRequestParam, callbacks: RaccoonRequestCallbacks, headers?: Record<string, string>): Promise<void> {
    let ca: ClientAndAuthInfo | undefined = this.getActiveClient();
    let opts = ca?.options[ModelCapacity.assistant];
    if (ca && ca.authInfo && opts) {
      let knowledgeBases: KnowledgeBase[] = [];
      if (this.knowledgeBaseRef) {
        knowledgeBases = await this.listKnowledgeBase();
      }
      let config: RequestParam = {
        ...opts.parameters,
        ...param,
        knowledgeBases
      };
      let org = this.activeOrganization();
      let options: ChatOptions = {
        messages,
        config,
        headers,
        ...callbacks
      };
      return ca.client.chat(ca.authInfo, options, org).catch(e => {
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

  public async completion(prompt: string, param: RaccoonRequestParam, callbacks: RaccoonRequestCallbacks, headers?: Record<string, string>): Promise<void> {
    let ca: ClientAndAuthInfo | undefined = this.getActiveClient();
    let opts = ca?.options[ModelCapacity.completion];
    if (ca && ca.authInfo && opts) {
      let knowledgeBases: KnowledgeBase[] = [];
      if (this.knowledgeBaseRef) {
        knowledgeBases = await this.listKnowledgeBase();
      }
      let config: RequestParam = {
        ...opts.parameters,
        ...param,
        knowledgeBases
      };
      let org = this.activeOrganization();
      let options: CompletionOptions = {
        prompt,
        config,
        headers,
        ...callbacks
      };
      return ca.client.completion(ca.authInfo, options, org).catch(e => {
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

  public sendTelemetry(metricType: MetricType, common: Record<string, any>, metric: Record<string, any> | undefined): Promise<void> {
    let ca: ClientAndAuthInfo | undefined = this.getActiveClient();
    let org: Organization | undefined = this.activeOrganization();
    if (!ca || !ca.authInfo) {
      return Promise.resolve();
    }
    return ca.client.sendTelemetry(ca.authInfo, org, metricType, common, metric);
  }

  public get autoComplete(): boolean {
    return this.context.globalState.get("CompletionAutomatically", true);
  }

  public set autoComplete(v: boolean) {
    this.context.globalState.update("CompletionAutomatically", v).then(() => {
      this.notifyStateChange({ scope: ["config"] });
    });
  }

  public get completionPreference(): CompletionPreferenceType {
    return this.context.globalState.get("CompletionPreference", CompletionPreferenceType.balanced);
  }

  public set completionPreference(v: CompletionPreferenceType) {
    this.context.globalState.update("CompletionPreference", v).then(() => {
      this.notifyStateChange({ scope: ["config"] });
    });
  }

  public get streamResponse(): boolean {
    return this.context.globalState.get("StreamResponse", true);
  }

  public set streamResponse(v: boolean) {
    this.context.globalState.update("StreamResponse", v).then(() => {
      this.notifyStateChange({ scope: ["config"] });
    });
  }

  public get candidates(): number {
    return this.context.globalState.get("Candidates", 1);
  }

  public set candidates(v: number) {
    this.context.globalState.update("Candidates", v).then(() => {
      this.notifyStateChange({ scope: ["config"] });
    });
  }

  public maxInputTokenNum(capacity: ModelCapacity): number {
    let ca: ClientAndAuthInfo | undefined = this.getActiveClient();
    if (ca) {
      return ca.options[capacity]?.maxInputTokenNum || 0;
    }
    return 0;
  }

  public totalTokenNum(capacity: ModelCapacity): number {
    let ca: ClientAndAuthInfo | undefined = this.getActiveClient();
    if (ca) {
      return ca.options[capacity]?.totalTokenNum || 0;
    }
    return 0;
  }

  public get completionDelay(): number {
    return this.context.globalState.get("CompletionDelay", 0);
  }

  public set completionDelay(v: number) {
    this.context.globalState.update("CompletionDelay", v).then(() => {
      this.notifyStateChange({ scope: ["config"] });
    });
  }

  public get knowledgeBaseRef(): boolean {
    return this.context.globalState.get("KnowledgeBaseRef", false);
  }

  public set knowledgeBaseRef(value: boolean) {
    this.context.globalState.update("KnowledgeBaseRef", value).then(() => {
      this.notifyStateChange({ scope: ["config"] });
    });
  }

  public get workspaceRef(): boolean {
    return this.context.globalState.get("workspaceRef", false);
  }

  public set workspaceRef(value: boolean) {
    this.context.globalState.update("workspaceRef", value).then(() => {
      this.notifyStateChange({ scope: ["config"] });
    });
  }

  public get webRef(): boolean {
    return this.context.globalState.get("webRef", false);
  }

  public set webRef(value: boolean) {
    this.context.globalState.update("webRef", value).then(() => {
      this.notifyStateChange({ scope: ["config"] });
    });
  }

  public get privacy(): boolean {
    return this.context.globalState.get("Privacy", false);
  }

  public set privacy(accept: boolean) {
    this.context.globalState.update("Privacy", accept).then(() => {
      this.notifyStateChange({ scope: ["config"] });
    });
  }
}