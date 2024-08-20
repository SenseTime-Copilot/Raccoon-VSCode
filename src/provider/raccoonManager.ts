import { commands, env, ExtensionContext, window, workspace, WorkspaceConfiguration, EventEmitter, Uri, ProgressLocation } from "vscode";
import { AuthInfo, AuthMethod, RequestParam, ChatOptions, CodeClient, Role, Message, CompletionOptions, Organization, AccountInfo, KnowledgeBase, MetricType, BrowserLoginParam, PhoneLoginParam, EmailLoginParam, ApiKeyLoginParam, CompletionContext, UrlType, Capability } from "../raccoonClient/CodeClient";
import { RaccoonClient } from "../raccoonClient/raccoonClinet";
import { extensionNameCamel, extensionNameKebab, extensionVersion, outlog, raccoonConfig } from "../globalEnv";
import { RaccoonPrompt } from "./promptTemplates";
import { PromptType } from "./promptTemplates";
import { ClientOption, ModelCapacity } from "./config";
import { RaccoonAgent } from "./agentManager";
import { TGIClient } from "../raccoonClient/tgiClient";
import { compareVersion } from "../utils/versionCompare";

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

type ChangeScope = "agent" | "prompt" | "engines" | "active" | "authorization" | "organization" | "config";
const individual = "Individual";

export interface StatusChangeEvent {
  scope: ChangeScope[];
  state?: string;
  args?: any;
  quiet?: boolean;
}

export class RaccoonManager {
  protected static instance: RaccoonManager | undefined = undefined;
  private flag: string;

  private configuration: WorkspaceConfiguration;
  private _clients: { [key: string]: ClientAndConfigInfo } = {};
  private changeStatusEmitter = new EventEmitter<StatusChangeEvent>();
  public onDidChangeStatus = this.changeStatusEmitter.event;

  public static getInstance(context: ExtensionContext): RaccoonManager {
    if (!RaccoonManager.instance) {
      RaccoonManager.instance = new RaccoonManager(context);
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
          let auth = authinfos[e.robotname] as AuthInfo;
          outlog.debug(`Append client ${e.robotname}: [Authorized - ${auth.account.username}]`);
          client.restoreAuthInfo(auth);
          client.syncUserInfo();
          // this.checkUpdate(client);
          try {
            capabilities = await client.capabilities();
          } catch (_e) {
          }
        } else {
          await client.login().then(async (ai) => {
            outlog.debug(`Append client ${e.robotname}: [Authorized - ${ai.account.username}]`);
            // this.checkUpdate(client);
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
    let loginPhase = false;
    let activeOrgStillAvailable = false;
    let newOrgAvailable = false;
    let activeOrgCode = this.activeOrganization()?.code;
    if (!activeOrgCode || activeOrgCode === individual) {
      activeOrgStillAvailable = true;
    }
    if (tks) {
      try {
        authinfos = JSON.parse(tks);
        if (ai) {
          if (authinfos && authinfos[clientName]) {
            let auth = authinfos[clientName];
            let newOrgs = ai.account.organizations || [];
            let oldOrgs = auth.account.organizations || [];
            let oldOrgIds = oldOrgs.map((o) => o.code);
            for (let newOrg of newOrgs) {
              if (newOrg.code === activeOrgCode) {
                activeOrgStillAvailable = true;
                continue;
              }
              if (!oldOrgIds.includes(newOrg.code)) {
                newOrgAvailable = true;
                continue;
              }
            }
          } else {
            if (ai.account.organizations && ai.account.organizations.length > 0) {
              loginPhase = true;
            }
          }
          authinfos[clientName] = ai;
        } else {
          activeOrgStillAvailable = true;
          delete authinfos[clientName];
        }
      } catch (e) { }
    } else if (ai) {
      authinfos[clientName] = ai;
      if (ai.account.organizations && ai.account.organizations.length > 0) {
        loginPhase = true;
      }
    }

    return this.context.secrets.store(`${extensionNameCamel}.tokens`, JSON.stringify(authinfos)).then(() => {
      let scope: ChangeScope[] = ["authorization"];
      let orgName: string | undefined = undefined;
      let state;
      if (loginPhase) {
        scope.push("organization");
        state = "login";
      } else if (newOrgAvailable) {
        scope.push("organization");
        state = "changed";
      } else if (!activeOrgStillAvailable) {
        scope.push("organization");
        state = "deleted";
        let ao = this.context.globalState.get<string>("ActiveOrganization", individual);
        if (ao !== individual) {
          orgName = ao;
        }
      }
      this.notifyStateChange({ scope, quiet, state, args: { orgName } });
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

  public get agents(): Map<string, RaccoonAgent> {
    let agants: Map<string, RaccoonAgent> = new Map();
    let builtinAgents = raccoonConfig.builtinAgents;
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
    let a = this.agents.get(id);
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
    let a = this.agents.get(id);
    if (a) {
      let as = this.context.globalState.get<string[]>(`${extensionNameKebab}.hiddenAgents`) || [];
      return !as.includes(id);
    }
    return true;
  }

  public async appendAgent(agent: RaccoonAgent, overwrite?: boolean): Promise<void> {
    let cfg = workspace.getConfiguration(extensionNameCamel, undefined);
    let writeable = true;
    if (!overwrite && this.agents.get(agent.id)) {
      writeable = false;
    }
    if (!writeable) {
      await window.showWarningMessage(raccoonConfig.t("The agent already exists, overwrite it?"), raccoonConfig.t("Cancel"), raccoonConfig.t("Overwrite")).then(res => {
        if (res === raccoonConfig.t("Overwrite")) {
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
    let ps = this.prompts;
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
      await window.showWarningMessage(raccoonConfig.t("The prompt already exists, overwrite it?"), raccoonConfig.t("Cancel"), raccoonConfig.t("Overwrite")).then(res => {
        if (res === raccoonConfig.t("Overwrite")) {
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
    let customPrompts: { [key: string]: any } = {};
    if (cfg) {
      customPrompts = cfg.get<{ [key: string]: any }>("Prompt", {});
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
    let p = this.prompts.filter((v) => v.label === label);
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
    let ps = this.prompts;
    let p = ps.filter((v) => v.label === label);
    if (p[0]) {
      let as = this.context.globalState.get<string[]>(`${extensionNameKebab}.hiddenPrompts`) || [];
      return !as.includes(label);
    }
    return true;
  }

  public get prompts(): RaccoonPrompt[] {
    let prompts: RaccoonPrompt[] = [];
    let builtinPrompt: ReadonlyArray<RaccoonPrompt> = raccoonConfig.builtinPrompt();
    for (let idx in builtinPrompt) {
      let p: RaccoonPrompt = {
        label: builtinPrompt[idx].label,
        type: builtinPrompt[idx].type,
        icon: builtinPrompt[idx].icon,
        shortcut: builtinPrompt[idx].shortcut,
        args: builtinPrompt[idx].args,
        message: {
          role: Role.user,
          content: `${builtinPrompt[idx].message.content}`
        }
      };
      prompts.push(p);
    }
    let customPrompts = this.configuration.get<{ [key: string]: string | any }>("Prompt", {});
    for (let label in customPrompts) {
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
    for (let p of prompts) {
      if (p.args && Object.keys(p.args).length > 0) {
        p.inputRequired = true;
      }
    }
    return prompts;
  }

  public static parseStringPrompt(label: string, prompt: string, shortcut: string): RaccoonPrompt {
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

  private checkUpdate(client: CodeClient) {
    if (raccoonConfig.type !== "Enterprise") {
      return;
    }
    let ai = client.getAuthInfo();
    if (!ai || !ai.account.organizations || !ai.account.organizations[0]) {
      return;
    }
    let org = ai.account.organizations[0];
    client.getOrgSettings(org).then(info => {
      let remoteFilename = info.pluginInfo.fileName;
      let remotePluginVersion = info.pluginInfo.version;
      if (remotePluginVersion) {
        if (compareVersion(remotePluginVersion, extensionVersion) < 0) {
          window.showInformationMessage(raccoonConfig.t("New version available, Update now?"), raccoonConfig.t("Update")).then((v) => {
            if (v === raccoonConfig.t("Update")) {
              window.withProgress(
                {
                  location: ProgressLocation.Notification,
                  cancellable: true
                },
                async (progress, _cancel) => {
                  progress.report({ message: raccoonConfig.t("Downloading...") });
                  return client.getFile(org, remoteFilename).then(buffer => {
                    let downloadUri = Uri.joinPath(this.context.globalStorageUri, remoteFilename);
                    return workspace.fs.writeFile(downloadUri, new Uint8Array(buffer))
                      .then(() => {
                        progress.report({ message: raccoonConfig.t("Installing...") });
                        return commands.executeCommand("workbench.extensions.command.installFromVSIX", [downloadUri]).then(() => {
                          progress.report({ message: raccoonConfig.t("New extension updated"), increment: 100 });
                          return workspace.fs.delete(downloadUri);
                        }, (reason) => {
                          console.log(reason);
                          return workspace.fs.delete(downloadUri);
                        });
                      }
                      );
                  });
                }
              );
            }
          });
        }
      }
    });
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

  public async setActiveOrganization(orgCode?: string): Promise<void> {
    if (!orgCode) {
      orgCode = individual;
    }
    let ao = this.context.globalState.get<string>("ActiveOrganization", individual);
    if (orgCode === ao) {
      return Promise.resolve();
    }
    return this.context.globalState.update("ActiveOrganization", orgCode).then(() => {
      this.updateKnowledgeBaseSettings();
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

  private async updateKnowledgeBaseSettings(): Promise<KnowledgeBase[] | undefined> {
    let ca: ClientAndConfigInfo | undefined = this.getActiveClient();
    if (ca) {
      return ca.client.capabilities().then(caps => {
        ca!.capabilities = [...caps];
        if (caps.includes(Capability.fileSearch)) {
          return this.listKnowledgeBase(true);
        }
      });
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

  public login(param: ApiKeyLoginParam | BrowserLoginParam | PhoneLoginParam | EmailLoginParam): Thenable<'ok' | Error> {
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
          await this.context.globalState.update("ActiveOrganization", individual);
          let orgs = token.account.organizations;
          if (orgs) {
            let isEnterprise = (raccoonConfig.type === "Enterprise");
            if (isEnterprise && orgs.length > 0) {
              await this.context.globalState.update("ActiveOrganization", orgs[0].code);
            }
          }
          this.updateToken(ca.client.robotName, token);
          progress.report({ increment: 100 });
          return 'ok';
        } else {
          return new Error(raccoonConfig.t("Incorrect username or password"));
        }
      }, (err) => {
        return new Error(err.response?.data?.details || err.message);
      });
    }).then((v) => {
      if (ca && v === "ok") {
        // this.checkUpdate(ca.client);
      }
      return v;
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
      let authInfo = ca.client.getAuthInfo();
      let org = this.activeOrganization();
      if (!config.maxNewTokenNum && (org || authInfo?.account.pro)) {
        config.maxNewTokenNum = (this.totalTokenNum(ModelCapacity.assistant) - this.maxInputTokenNum(ModelCapacity.assistant));
      }
      let options: ChatOptions = {
        messages,
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
      return Promise.reject(Error(raccoonConfig.t("Unauthorized")));
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
      return Promise.reject(Error(raccoonConfig.t("Unauthorized")));
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
    let ca: ClientAndConfigInfo | undefined = this.getActiveClient();
    if (ca && ca.capabilities.includes(Capability.fileSearch)) {
      return this.context.globalState.get("KnowledgeBaseRef", false);
    } else {
      return false;
    }
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
    let ca: ClientAndConfigInfo | undefined = this.getActiveClient();
    if (ca && ca.capabilities.includes(Capability.fileSearch)) {
      return this.context.globalState.get("workspaceRef", false);
    } else {
      return false;
    }
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