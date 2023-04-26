import axios from 'axios';
import {
  commands,
  authentication,
  AuthenticationProvider,
  AuthenticationProviderAuthenticationSessionsChangeEvent,
  AuthenticationSession,
  AuthenticationSessionAccountInformation,
  Disposable,
  Event,
  EventEmitter,
  ExtensionContext,
  window,
  l10n,
} from 'vscode';
import { configuration } from '../extension';

export function registerAuthProvider(context: ExtensionContext) {
  let auth = new SenseCodeAuthenticationProvider(context);
  context.subscriptions.push(authentication.registerAuthenticationProvider(
    SenseCodeAuthenticationProvider.id,
    'SenseCode',
    auth
  ));
  authentication.getSession(SenseCodeAuthenticationProvider.id, [], { createIfNone: false });
  context.subscriptions.push(
    commands.registerCommand('sensecode.login', () => {
      return authentication.getSession(SenseCodeAuthenticationProvider.id, [], { createIfNone: true });
    })
  );

  context.subscriptions.push(
    commands.registerCommand('sensecode.logout', async () => {
      window.showWarningMessage(l10n.t("About to logout"), { modal: true, detail: l10n.t("It will clear all settings, includes API Keys.") }, l10n.t("OK")).then((v) => {
        if (v === l10n.t("OK")) {
          auth.removeSession("");
          configuration.clear();
        }
      });
    })
  );
}

class SenseCodeSession implements AuthenticationSession {
  readonly account: AuthenticationSessionAccountInformation;
  readonly id: string;
  readonly scopes: string[];
  readonly accessToken: string;
  constructor(public readonly user: string | undefined, label: string, public readonly token: string) {
    this.account = { id: user || "", label: label };
    this.id = SenseCodeAuthenticationProvider.id;
    this.scopes = [];
    this.accessToken = token;
  }
}

export class SenseCodeAuthenticationProvider implements AuthenticationProvider, Disposable {
  static id = 'sensecode.account';
  private static userKey = 'sensecode.user';
  private static labelKey = 'sensecode.label';
  private static secretKey = 'sensecode.secret';

  private currentUser: Promise<string | undefined> | undefined;
  private currentToken: Promise<string | undefined> | undefined;
  private initializedDisposable: Disposable | undefined;

  private _onDidChangeSessions = new EventEmitter<AuthenticationProviderAuthenticationSessionsChangeEvent>();
  get onDidChangeSessions(): Event<AuthenticationProviderAuthenticationSessionsChangeEvent> {
    return this._onDidChangeSessions.event;
  }

  constructor(private context: ExtensionContext) {
    authentication.getSession(SenseCodeAuthenticationProvider.id, []).then(seesion => {
      if (seesion && seesion.accessToken) {
        this.getOAuthToken(seesion.account.id, seesion.accessToken).then(async (userInfo) => {
          context.globalState.update("sensecode.avatar", userInfo.avatar);
        });
      }
    });
  }

  dispose(): void {
    this.initializedDisposable?.dispose();
  }

  private ensureInitialized(): void {
    if (this.initializedDisposable === undefined) {
      this.cacheUserFromStorage();
      this.cacheTokenFromStorage();
      this.initializedDisposable = Disposable.from(
        this.context.secrets.onDidChange(e => {
          if (e.key === SenseCodeAuthenticationProvider.userKey) {
            void this.checkForUpdates();
          }
        }),
        this.context.secrets.onDidChange(e => {
          if (e.key === SenseCodeAuthenticationProvider.secretKey) {
            void this.checkForUpdates();
          }
        }),
        authentication.onDidChangeSessions(e => {
          if (e.provider.id === SenseCodeAuthenticationProvider.id) {
            void this.checkForUpdates();
          }
        }),
      );
    }
  }

  public static getAvatar(context: ExtensionContext) {
    return context.globalState.get("sensecode.avatar");
  }

  public fireChangeEvent() {
    this._onDidChangeSessions.fire({ added: [], removed: [], changed: [] });
  }

  private async checkForUpdates(): Promise<void> {
    const added: AuthenticationSession[] = [];
    const removed: AuthenticationSession[] = [];
    const changed: AuthenticationSession[] = [];

    const previousUser = await this.currentUser;
    const previousToken = await this.currentToken;
    const session = (await this.getSessions())[0];

    if (session?.accessToken && !previousToken) {
      added.push(session);
    } else if (!session?.accessToken && previousToken) {
      removed.push(session);
    } else if (session?.accessToken !== previousToken || session?.account.id !== previousUser) {
      changed.push(session);
    } else {
      return;
    }

    await this.cacheTokenFromStorage();
    await this.cacheUserFromStorage();
    this._onDidChangeSessions.fire({ added: added, removed: removed, changed: changed });
  }

  private cacheUserFromStorage() {
    this.currentUser = this.context.secrets.get(SenseCodeAuthenticationProvider.userKey) as Promise<string | undefined>;
    return this.currentUser;
  }

  private cacheLabelFromStorage() {
    this.currentUser = this.context.secrets.get(SenseCodeAuthenticationProvider.labelKey) as Promise<string | undefined>;
    return this.currentUser;
  }

  private cacheTokenFromStorage() {
    this.currentToken = this.context.secrets.get(SenseCodeAuthenticationProvider.secretKey) as Promise<string | undefined>;
    return this.currentToken;
  }

  async getSessions(_scopes?: string[]): Promise<readonly AuthenticationSession[]> {
    this.ensureInitialized();
    const user = await this.cacheUserFromStorage();
    const label = await this.cacheLabelFromStorage();
    const token = await this.cacheTokenFromStorage();
    if (token && label) {
      return [new SenseCodeSession(user, label, token)];
    }
    return [];
  }

  async getOAuthToken(user: string | undefined, pw: string): Promise<any> {
    if (user && user !== "") {
      return axios.post(`https://gitlab.bj.sensetime.com/oauth/token`,
        {
          // eslint-disable-next-line @typescript-eslint/naming-convention
          "grant_type": "password",
          "username": user,
          "password": pw
        })
        .then(
          async (res) => {
            if (res?.status === 200) {
              return axios.get(`https://gitlab.bj.sensetime.com/api/v4/user`,
                {
                  // eslint-disable-next-line @typescript-eslint/naming-convention
                  headers: { Authorization: "Bearer " + res.data.access_token }
                })
                .then(
                  (res1) => {
                    if (res1?.status === 200) {
                      // eslint-disable-next-line @typescript-eslint/naming-convention
                      return { avatar: res1.data.avatar_url, name: res1.data.name };
                    }
                  }
                ).catch(async (_error) => {
                });
            }
            return Promise.reject(new Error("Invalid API Key"));
          }
        ).catch(async (error) => {
          return Promise.reject(error);
        });
    } else {
      return axios.get(`https://gitlab.bj.sensetime.com/api/v4/user`,
        {
          // eslint-disable-next-line @typescript-eslint/naming-convention
          headers: { "PRIVATE-TOKEN": pw }
        })
        .then(
          async (res) => {
            return { avatar: res.data.avatar_url, name: res.data.name };
          }
        ).catch(async (error) => {
          return Promise.reject(error);
        });
    }
  }

  async createSession(_scopes: string[]): Promise<AuthenticationSession> {
    this.ensureInitialized();

    const session = await window.showInputBox({
      ignoreFocusOut: true,
      placeHolder: l10n.t('Account Name'),
      prompt: l10n.t('Enter Account Name, or keep empty to use a Personal Access Token.'),
    }).then(async (user) => {
      if (user && user.trim() === "") {
        user = undefined;
      }
      return window.showInputBox({
        ignoreFocusOut: true,
        placeHolder: user ? l10n.t("Password for {0}", user) : l10n.t("Personal Access Token"),
        password: true,
      }).then((token) => {
        return { user, token };
      });
    });

    if (session && session.token) {
      return this.getOAuthToken(session.user, session.token).then(async (userInfo) => {
        await this.context.globalState.update("sensecode.avatar", userInfo.avatar);
        await this.context.secrets.store(SenseCodeAuthenticationProvider.userKey, session.user || "");
        await this.context.secrets.store(SenseCodeAuthenticationProvider.labelKey, userInfo.name);
        await this.context.secrets.store(SenseCodeAuthenticationProvider.secretKey, session.token!);
        return new SenseCodeSession(session.user, userInfo.name, session.token!);
      }, (_reason) => {
        throw new Error('SenseCode login failed');
      });
    } else {
      throw new Error('SenseCode login failed');
    }
  }

  async removeSession(_sessionId: string): Promise<void> {
    await this.context.globalState.update("sensecode.avatar", undefined);
    await this.context.secrets.delete(SenseCodeAuthenticationProvider.userKey);
    await this.context.secrets.delete(SenseCodeAuthenticationProvider.secretKey);
  }
}