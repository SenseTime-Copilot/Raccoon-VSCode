import { commands, env, ExtensionContext, l10n, window, workspace, WorkspaceConfiguration, EventEmitter, Uri, QuickPickItem, QuickPickItemKind } from "vscode";
import { AuthInfo, AuthMethod, RequestParam, ChatOptions, CodeClient, Role, Message, Choice, CompletionOptions, Organization, AccountInfo, KnowledgeBase, MetricType, AccessKeyLoginParam, BrowserLoginParam, PhoneLoginParam, EmailLoginParam, ApiKeyLoginParam, CompletionContext, UrlType, Capability } from "../raccoonClient/CodeClient";
import { RaccoonClient } from "../raccoonClient/raccoonClinet";
import { extensionNameCamel, extensionNameKebab, outlog, raccoonConfig, raccoonManager, registerCommand, telemetryReporter } from "../globalEnv";
import { RaccoonPrompt } from "./promptTemplates";
import { PromptType } from "./promptTemplates";
import { GitUtils } from "../utils/gitUtils";
import { Repository } from "../utils/git";
import { buildHeader } from "../utils/buildRequestHeader";
import { ClientOption, ModelCapacity } from "./config";
import { RaccoonAgent, builtinAgents } from "./agentManager";
import { TGIClient } from "../raccoonClient/tgiClient";

export type RaccoonRequestParam = Pick<RequestParam, "stream" | "n" | "maxNewTokenNum" | "stop" | "tools" | "toolChoice">;
export type RaccoonRequestCallbacks = Pick<ChatOptions, "thisArg" | "onHeader" | "onError" | "onFinish" | "onUpdate" | "onController">;

export enum CompletionPreferenceType {
  singleLine = "Single Line",
  balanced = "Balanced",
  bestEffort = "Best Effort"
}

interface ClientAndConfigInfo {
  client: CodeClient;
  capabilities: Capability[];
  options: { [key in ModelCapacity]?: ClientOption };
}

type ChangeScope = "agent" | "prompt" | "engines" | "active" | "authorization" | "config";
const individual = "Individual";

export interface StatusChangeEvent {
  scope: ChangeScope[];
  quiet?: boolean;
}

export class RaccoonManager {
  protected static instance: RaccoonManager | undefined = undefined;
  private flag: string;

  private configuration: WorkspaceConfiguration;
  private _clients: { [key: string]: ClientAndConfigInfo } = {};
  private changeStatusEmitter = new EventEmitter<StatusChangeEvent>();
  public onDidChangeStatus = this.changeStatusEmitter.event;

  private static abortCtrller: { [key: string]: AbortController } = {};

  public static getInstance(context: ExtensionContext): RaccoonManager {
    function commitMessageByLLM(rm: RaccoonManager, changes: string, targetRepo: Repository): Promise<void> {
      if (RaccoonManager.abortCtrller[targetRepo.rootUri.toString()] && !RaccoonManager.abortCtrller[targetRepo.rootUri.toString()].signal.aborted) {
        RaccoonManager.abortCtrller[targetRepo.rootUri.toString()].abort();
        delete RaccoonManager.abortCtrller[targetRepo!.rootUri.toString()];
        return Promise.resolve();
      }
      const commitMsg = targetRepo.inputBox.value;
      targetRepo.inputBox.value = '';
      let preComiitMsg = '';
      if (commitMsg) {
        preComiitMsg = `\n\n\nsome reference info you must follow: ${commitMsg}`;
      }

      // eslint-disable-next-line @typescript-eslint/naming-convention
      telemetryReporter.logUsage(MetricType.commitMessage, { usage_num: 1 });

      return rm.chat(
        [{ role: Role.user, content: `Here are changes of current codebase:\n\n\`\`\`diff\n${changes}\n\`\`\`\n\nWrite a commit message summarizing these changes, not have to cover erevything, key-points only, limited the message to 40 characters, in plain text format, and without quotation marks.${preComiitMsg}\n\n\n` }],
        {
          stream: true,
          maxNewTokenNum: 128,
          n: 1
        },
        {
          onHeader: (_headers: Headers) => {

          },
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
          onFinish(_choices, _thisArg) {
            delete RaccoonManager.abortCtrller[targetRepo!.rootUri.toString()];
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
    this.flag = `${context.extension.id}-${context.extension.packageJSON.version}`;
    outlog.debug(`------------------- ${this.flag} -------------------`);

    this.configuration = workspace.getConfiguration(extensionNameCamel, undefined);
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
      if (e.key === `${extensionNameCamel}.stateUpdated`) {
        this.context.secrets.get(`${extensionNameCamel}.stateUpdated`).then((notify) => {
          if (notify) {
            let ntfy = JSON.parse(notify);
            let evt = ntfy.event as StatusChangeEvent;
            if (ntfy.sessionId !== env.sessionId) {
              if (evt.scope.includes("authorization")) {
                context.secrets.get(`${extensionNameCamel}.tokens`).then((tks) => {
                  try {
                    let authinfos: { [key: string]: AuthInfo } = JSON.parse(tks || "{}");
                    let quiet = true;
                    let activeClientName = this.getActiveClientRobotName();
                    for (let c in this._clients) {
                      let ca = this._clients[c];
                      if (ca) {
                        let act = ca.client.restoreAuthInfo(authinfos[c]);
                        if (ca.client.robotName === activeClientName) {
                          if (act !== "UPDATE") {
                            quiet = false;
                          }
                        }
                      }
                    }
                    evt.quiet = quiet;
                  } catch (_e) { }
                  this.changeStatusEmitter.fire(evt);
                }, () => {
                  this.changeStatusEmitter.fire(evt);
                });
              } else {
                this.changeStatusEmitter.fire(evt);
              }
            } else {
              this.changeStatusEmitter.fire(evt);
            }
          }
        });
      }
    });
  }

  public async initialClients(): Promise<void> {
    let ret = this.context.globalState.get<boolean>(this.flag);
    if (!ret) {
      // await this.resetAllCacheData();
      await this.context.globalState.update(this.flag, true);
    }
    let tks = await this.context.secrets.get(`${extensionNameCamel}.tokens`);
    let authinfos: any = {};
    if (tks) {
      try {
        authinfos = JSON.parse(tks);
      } catch (e) { }
    }
    let es = raccoonConfig.builtinEngines;
    this._clients = {};
    for (let e of es) {
      if (e.robotname) {
        let client: CodeClient;
        if (e.apiType === "TGI") {
          client = new TGIClient(e);
        } else if (e.apiType === "Raccoon") {
          client = new RaccoonClient(e);
        } else {
          client = new RaccoonClient(e);
        }
        client.setLogger(outlog.debug);
        client.onDidChangeAuthInfo(async (ai) => {
          await this.updateToken(e.robotname, ai, !!ai);
        });
        let capabilities: Capability[] = [];
        if (authinfos[e.robotname]) {
          outlog.debug(`Append client ${e.robotname}: [Authorized - ${authinfos[e.robotname].account.username}]`);
          client.restoreAuthInfo(authinfos[e.robotname]);
          try {
            capabilities = await client.capabilities();
          } catch (_e) {
          }
        } else {
          await client.login().then(async (ai) => {
            outlog.debug(`Append client ${e.robotname}: [Authorized - ${ai.account.username}]`);
            try {
              capabilities = await client.capabilities();
            } catch (_e) {
            }
            return this.updateToken(e.robotname, ai);
          }, (_err) => {
            outlog.debug(`Append client ${e.robotname} [Unauthorized]`);
            return undefined;
          });
        }
        this._clients[e.robotname] = { client, capabilities, options: e };
      }
    }
  }

  private async updateToken(clientName: string, ai?: AuthInfo, quiet?: boolean) {
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
    return this.context.secrets.store(`${extensionNameCamel}.tokens`, JSON.stringify(authinfos)).then(() => {
      this.notifyStateChange({ scope: ["authorization"], quiet });
    });
  }

  public clear(): void {
    let logoutAct: Promise<void>[] = [];
    for (let e in this._clients) {
      let ca = this._clients[e];
      logoutAct.push(
        ca.client.logout().then((logoutUrl) => {
          if (logoutUrl) {
            commands.executeCommand("vscode.open", logoutUrl);
          }
        }, (err) => {
          outlog.debug(`Logout ${e} failed: ${err}`);
        })
      );
    }
    Promise.all(logoutAct).then(() => {
      this.clearStatusData();
    }, () => {
      this.clearStatusData();
    });
  }

  private async clearStatusData(): Promise<void> {
    await this.resetAllCacheData().then(async () => {
      await this.initialClients();
    });
  }

  private notifyStateChange(event: StatusChangeEvent) {
    let timeStamp = new Date().valueOf();
    this.context.secrets.store(`${extensionNameCamel}.stateUpdated`, `${JSON.stringify({ sessionId: env.sessionId, timeStamp, event })}`);
  }

  private async resetAllCacheData() {
    this.context.globalState.keys().forEach(async (v, _idx, _arr) => {
      await this.context.globalState.update(v, undefined);
    });
    await this.configuration.update("Agent", undefined, true);
    await this.configuration.update("Prompt", undefined, true);

    await this.context.secrets.delete(`${extensionNameCamel}.tokens`);
    this.notifyStateChange({ scope: ["authorization", "active", "engines", "agent", "prompt", "config"] });
  }

  public update(): void {
    this.configuration = workspace.getConfiguration(`${extensionNameCamel}`, undefined);
  }

  private getClient(client?: string): ClientAndConfigInfo | undefined {
    if (!client) {
      return undefined;
    }
    for (let e in this._clients) {
      if (e === client) {
        return this._clients[e];
      }
    }
  }

  private getActiveClient(): ClientAndConfigInfo | undefined {
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

  public setActiveClient(clientName: string | undefined) {
    let originClientState = this.context.globalState.get<string>("ActiveClient");
    if (originClientState !== clientName) {
      this.context.globalState.update("ActiveClient", clientName).then(() => {
        this.notifyStateChange({ scope: ["active"] });
      });
    }
  }

  public isClientLoggedin() {
    let ca: ClientAndConfigInfo | undefined = this.getActiveClient();
    return (ca && ca.client.getAuthInfo());
  }

  public get agent(): Map<string, RaccoonAgent> {
    let agants: Map<string, RaccoonAgent> = new Map();
    for (let agent of builtinAgents) {
      agants.set(agent.id, agent);
    }
    let customAgents: Map<string, RaccoonAgent> = new Map(Object.entries(this.configuration.get("Agent") || {}));
    customAgents?.forEach((value, key, _map) => {
      agants.set(key, value);
    });
    return agants;
  }

  public async setAgentVisibility(id: string, visible: boolean) {
    let a = this.agent.get(id);
    if (a) {
      let as = this.context.globalState.get<string[]>(`${extensionNameKebab}.hiddenAgents`) || [];
      if (visible && as.includes(id)) {
        return this.context.globalState.update(`${extensionNameKebab}.hiddenAgents`, as.filter(v => v !== id)).then(() => {
          this.notifyStateChange({ scope: ["agent"] });
        });
      } else if (!visible && !as.includes(id)) {
        return this.context.globalState.update(`${extensionNameKebab}.hiddenAgents`, [...as, id]).then(() => {
          this.notifyStateChange({ scope: ["agent"] });
        });
      }
    }
    return Promise.resolve();
  }

  public checkAgentVisibility(id: string) {
    let a = this.agent.get(id);
    if (a) {
      let as = this.context.globalState.get<string[]>(`${extensionNameKebab}.hiddenAgents`) || [];
      return !as.includes(id);
    }
    return true;
  }

  public async appendAgent(agent: RaccoonAgent, overwrite?: boolean): Promise<void> {
    let cfg = workspace.getConfiguration(extensionNameCamel, undefined);
    let writeable = true;
    if (!overwrite && this.agent.get(agent.id)) {
      writeable = false;
    }
    if (!writeable) {
      await window.showWarningMessage(l10n.t("The agent already exists, overwrite it?"), l10n.t("Cancel"), l10n.t("Overwrite")).then(res => {
        if (res === l10n.t("Overwrite")) {
          writeable = true;
        }
      }, () => { });
    }
    if (!writeable) {
      return Promise.reject();
    }
    let customAgents: Map<string, RaccoonAgent> = new Map(Object.entries(this.configuration.get("Agent") || {}));
    customAgents.set(agent.id, agent);
    return cfg.update("Agent", Object.fromEntries(customAgents), true);
  }

  public async removeAgent(id: string) {
    let cfg = workspace.getConfiguration(extensionNameCamel, undefined);
    let customAgents: Map<string, RaccoonAgent> = new Map(Object.entries(this.configuration.get("Agent") || {}));
    if (customAgents) {
      customAgents.delete(id);
      cfg.update("Agent", Object.fromEntries(customAgents), true);
    }
  }

  public getPromptItem(label: string): RaccoonPrompt | undefined {
    let ps = this.prompt;
    let t = ps.filter((p) => (p.label === label && p.type === PromptType.customPrompt));
    return t[0];
  }

  public async appendPrompt(label: string, shortcut: string, prompt: string, overwrite?: boolean): Promise<void> {
    let cfg = workspace.getConfiguration(extensionNameCamel, undefined);
    let customPrompts: { [key: string]: string | any } = {};
    let writeable = true;
    if (cfg) {
      customPrompts = cfg.get("Prompt", {});
      if (!overwrite) {
        for (let labelName in customPrompts) {
          if (typeof customPrompts[labelName] === 'object') {
            if (labelName === label) {
              writeable = false;
            }
          }
        }
      }
    }
    if (!writeable) {
      await window.showWarningMessage(l10n.t("The prompt already exists, overwrite it?"), l10n.t("Cancel"), l10n.t("Overwrite")).then(res => {
        if (res === l10n.t("Overwrite")) {
          writeable = true;
        }
      }, () => { });
    }
    if (!writeable) {
      return Promise.reject();
    }
    let p = RaccoonManager.parseStringPrompt(label, prompt, shortcut);
    let savep: any = { shortcut: p.shortcut, origin: prompt, prompt: p.message.content, args: p.args };
    return cfg.update("Prompt", { ...customPrompts, [label]: savep }, true);
  }

  public async removePromptItem(label: string) {
    let cfg = workspace.getConfiguration(extensionNameCamel, undefined);
    let customPrompts: { [key: string]: string | any } = {};
    if (cfg) {
      customPrompts = cfg.get("Prompt", {});
      for (let labelName in customPrompts) {
        if (labelName === label) {
          customPrompts[labelName] = undefined;
          cfg.update("Prompt", customPrompts, true);
          return;
        }
      }
    }
  }

  public async setPromptVisibility(label: string, visible: boolean) {
    let p = this.prompt.filter((v) => v.label === label);
    if (p[0]) {
      let as = this.context.globalState.get<string[]>(`${extensionNameKebab}.hiddenPrompts`) || [];
      if (visible && as.includes(label)) {
        return this.context.globalState.update(`${extensionNameKebab}.hiddenPrompts`, as.filter(a => a !== label)).then(() => {
          this.notifyStateChange({ scope: ["prompt"] });
        });
      } else if (!visible && !as.includes(label)) {
        return this.context.globalState.update(`${extensionNameKebab}.hiddenPrompts`, [...as, label]).then(() => {
          this.notifyStateChange({ scope: ["prompt"] });
        });
      }
    }
    return Promise.resolve();
  }

  public checkPromptVisibility(label: string) {
    let p = this.prompt.filter((v) => v.label === label);
    if (p[0]) {
      let as = this.context.globalState.get<string[]>(`${extensionNameKebab}.hiddenPrompts`) || [];
      return !as.includes(label);
    }
    return true;
  }

  public get prompt(): RaccoonPrompt[] {
    let customPrompts: { [key: string]: string | any } = this.configuration.get("Prompt", {});
    let prompts: RaccoonPrompt[] = raccoonConfig.builtinPrompt();
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
    return raccoonConfig.builtinEngines.map((v, _idx, _arr) => {
      return v.robotname;
    });
  }

  public get capabilities(): Capability[] {
    let ca: ClientAndConfigInfo | undefined = this.getActiveClient();
    return ca?.capabilities || [];
  }

  public async userInfo(update: boolean = false, timeoutMs?: number): Promise<AccountInfo | undefined> {
    let ca: ClientAndConfigInfo | undefined = this.getActiveClient();
    let auth = ca?.client.getAuthInfo();
    if (ca && auth) {
      if (update) {
        return ca.client.syncUserInfo(timeoutMs);
      }
      return Promise.resolve(auth.account);
    }
    return Promise.resolve(undefined);
  }

  public organizationList(): Organization[] {
    let ca: ClientAndConfigInfo | undefined = this.getActiveClient();
    if (ca && ca.client) {
      let auth = ca?.client.getAuthInfo();
      return auth?.account.organizations || [];
    }
    return [];
  }

  private async setActiveOrganization(orgCode?: string): Promise<void> {
    if (!orgCode) {
      orgCode = individual;
    }
    let ao = this.context.globalState.get<string>("ActiveOrganization", individual);
    if (orgCode === ao) {
      return Promise.resolve();
    }
    return this.context.globalState.update("ActiveOrganization", orgCode).then(() => {
      this.notifyStateChange({ scope: ["active"] });
    });
  }

  public activeOrganization(): Organization | undefined {
    let ca: ClientAndConfigInfo | undefined = this.getActiveClient();
    if (ca && ca.client) {
      let auth = ca?.client.getAuthInfo();
      let orgs = auth?.account.organizations || [];
      let ao = this.context.globalState.get<string>("ActiveOrganization", individual);
      if (ao === individual) {
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
    let ca: ClientAndConfigInfo | undefined = this.getActiveClient();
    let org: Organization | undefined = this.activeOrganization();
    if (ca) {
      let ts = this.context.globalState.get<number>("KnowledgeBasesNextUpdateAt") || 0;
      let curTs = new Date().valueOf();
      let oldKb = this.context.globalState.get<KnowledgeBase[]>("KnowledgeBases") || [];
      if (update || (curTs > ts)) {
        return ca.client.listKnowledgeBase(org).then((kb) => {
          if (JSON.stringify(oldKb) !== JSON.stringify(kb)) {
            this.context.globalState.update("KnowledgeBases", kb);
          }
          this.context.globalState.update("KnowledgeBasesNextUpdateAt", curTs + (30 * 60 * 1000));
          return kb;
        }).catch((_e) => {
          this.context.globalState.update("KnowledgeBasesNextUpdateAt", curTs + (10 * 60 * 1000));
          return oldKb;
        });
      } else {
        return oldKb;
      }
    }
    return Promise.resolve([]);
  }

  public getAuthMethods(): AuthMethod[] {
    let ca: ClientAndConfigInfo | undefined = this.getActiveClient();
    if (ca) {
      return ca.client.authMethods;
    }
    return [];
  }

  public getUrl(type: UrlType): Uri | undefined {
    let ca: ClientAndConfigInfo | undefined = this.getActiveClient();
    if (ca) {
      return Uri.parse(ca.client.url(type));
    }
  }

  public login(param: ApiKeyLoginParam | AccessKeyLoginParam | BrowserLoginParam | PhoneLoginParam | EmailLoginParam): Thenable<'ok' | Error> {
    let ca: ClientAndConfigInfo | undefined = this.getActiveClient();

    return window.withProgress({
      location: { viewId: `${extensionNameKebab}.view` }
    }, async (progress, _cancel) => {
      if (!ca) {
        return new Error("Invalid Client Handler");
      }
      return ca.client.login(param).then(async (token) => {
        if (ca && token) {
          try {
            ca.capabilities = await ca.client.capabilities();
          } catch (_e) {
          }
          let orgs = token.account.organizations;
          if (orgs) {
            let isEnterprise = (raccoonConfig.type === "Enterprise");
            if (isEnterprise && orgs.length > 0 && !this.activeOrganization()) {
              this.setActiveOrganization(orgs[0].code);
            }
          }
          this.updateToken(ca.client.robotName, token);
          progress.report({ increment: 100 });
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
      let ca: ClientAndConfigInfo | undefined = this.getActiveClient();
      if (ca) {
        await ca.client.logout()
          .then(
            async (logoutUrl) => {
              if (logoutUrl) {
                commands.executeCommand("vscode.open", logoutUrl);
              }
            }
          ).finally(async () => {
            if (ca) {
              this.updateToken(ca.client.robotName);
              ca.capabilities = [];
              await this.context.globalState.update("ActiveOrganization", undefined);
              await this.context.globalState.update("ActiceClient", undefined);
            }
            progress.report({ increment: 100 });
          });
      }
    });
  }

  public async switchOrganization(includeIndividual: boolean) {
    interface OrgInfo extends QuickPickItem {
      id: string;
    };
    return window.withProgress({
      location: { viewId: `${extensionNameKebab}.view` }
    }, async (progress, _cancel) => {
      return this.userInfo(true, 3000).then(async (ac) => {
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
            };
          });

        let additionalItem: OrgInfo[] = [];
        if (includeIndividual) {
          let individualItem: OrgInfo = {
            label: ao ? `$(blank) ${l10n.t("Individual")}` : `$(check)  ${l10n.t("Individual")}`,
            description: `@${username}`,
            id: ""
          };
          let separator: OrgInfo = {
            id: "",
            label: "",
            kind: QuickPickItemKind.Separator
          };
          additionalItem = [individualItem, separator];
        }
        return window.showQuickPick<OrgInfo>([...additionalItem, ...orgs], { canPickMany: false, placeHolder: l10n.t("Select Organization") }).then((select) => {
          progress.report({ increment: 100 });
          if (select) {
            return raccoonManager.setActiveOrganization(select.id).then(() => {
              return this.listKnowledgeBase(true);
            });
          }
        });
      });
    });
  }

  public getModelCapacites(): ModelCapacity[] {
    let clientName = this.getActiveClientRobotName();
    if (!clientName) {
      return [];
    }
    let cfg = raccoonConfig.builtinEngines.filter((v, _idx, _arr) => v.robotname === clientName);
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
    let ca: ClientAndConfigInfo | undefined = this.getActiveClient();
    let opts = ca?.options[ModelCapacity.assistant];
    if (ca && opts) {
      let knowledgeBases: KnowledgeBase[] = [];
      if (this.knowledgeBaseRef) {
        try {
          knowledgeBases = await this.listKnowledgeBase();
        } catch (e) {
        }
      }
      let config: RequestParam = {
        ...opts.parameters,
        ...param,
        knowledgeBases
      };
      let org = this.activeOrganization();
      let authInfo = ca.client.getAuthInfo();
      if (!config.maxNewTokenNum && (org || authInfo?.account.pro)) {
        config.maxNewTokenNum = (this.totalTokenNum(ModelCapacity.assistant) - this.maxInputTokenNum(ModelCapacity.assistant));
      }
      let options: ChatOptions = {
        messages,
        template: opts.template,
        maxInputTokens: this.maxInputTokenNum(ModelCapacity.assistant),
        config,
        headers,
        ...callbacks
      };
      return ca.client.chat(options, org).catch(e => {
        if (e.response?.status === 401) {
          outlog.info(`[${ca!.client.robotName}] Reset access token sense 401 recevived`);
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

  public async completion(context: CompletionContext, param: RaccoonRequestParam, callbacks: RaccoonRequestCallbacks, headers?: Record<string, string>): Promise<void> {
    let ca: ClientAndConfigInfo | undefined = this.getActiveClient();
    let opts = ca?.options[ModelCapacity.completion];
    if (ca && opts) {
      let knowledgeBases: KnowledgeBase[] = [];
      if (this.knowledgeBaseRef) {
        try {
          knowledgeBases = await this.listKnowledgeBase();
        } catch (e) {
        }
      }
      let config: RequestParam = {
        ...opts.parameters,
        ...param,
        knowledgeBases
      };
      let org = this.activeOrganization();
      let options: CompletionOptions = {
        context,
        template: opts.template,
        maxInputTokens: this.maxInputTokenNum(ModelCapacity.completion),
        config,
        headers,
        ...callbacks
      };
      return ca.client.completion(options, org).catch(e => {
        if (e.response?.status === 401) {
          outlog.info(`[${ca!.client.robotName}] Reset access token sense 401 recevived`);
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
    let ca: ClientAndConfigInfo | undefined = this.getActiveClient();
    let org: Organization | undefined = this.activeOrganization();
    if (!ca) {
      return Promise.resolve();
    }
    return ca.client.sendTelemetry(org, metricType, common, metric);
  }

  public get codelens(): boolean {
    return this.context.globalState.get("Codelens", true);
  }

  public set codelens(v: boolean) {
    this.context.globalState.update("Codelens", v);
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
    let ca: ClientAndConfigInfo | undefined = this.getActiveClient();
    if (ca) {
      return ca.options[capacity]?.maxInputTokenNum || 0;
    }
    return 0;
  }

  public totalTokenNum(capacity: ModelCapacity): number {
    let ca: ClientAndConfigInfo | undefined = this.getActiveClient();
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
      if (!value) {
        this.context.globalState.update("KnowledgeBasesNextUpdateAt", 0);
      }
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