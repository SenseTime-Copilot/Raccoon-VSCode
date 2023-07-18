import axios, { ResponseType } from "axios";
import FormData = require("form-data");
import jwt_decode from "jwt-decode";
import * as crypto from "crypto";
import { IncomingMessage } from "http";
import * as zlib from "zlib";
import { CodeClient, AuthInfo, AuthProxy, ResponseData, FinishReason, Role, ClientConfig, Choice, Message } from "./CodeClient";

export interface ClientMeta {
  clientId: string;
  redirectUrl: string;
}

function demerge(m: string): string[] {
  var a = '';
  var b = '';
  var t = true;
  var flip = true;
  for (var i = 0; i < m.length; i++) {
    if (m[i] === ',') {
      flip = false;
      t = !t;
      continue;
    }
    if (t) {
      a += m[i];
    } else {
      b += m[i];
    }
    if (flip) {
      t = !t;
    }
  }
  return [a, b];
}

function unweaveKey(info: string) {
  let tokenKey = demerge(info);
  let p1 = Buffer.from(tokenKey[0], "base64").toString().trim().split("#");
  if (p1.length !== 3) {
    return {};
  }
  return {
    id: parseInt(p1[0]),
    name: p1[1],
    token: p1[2],
    aksk: tokenKey[1]
  };
}

function hmacSHA256(key: Buffer, data: Buffer): string {
  const hmac = crypto.createHmac('sha256', key);
  hmac.update(data);
  return hmac.digest('base64');
}

function generateSignature(urlString: string, date: string, ak: string, sk: string) {
  let url = new URL(urlString);
  let message: string = `date: ${date}\nPOST ${url.pathname} HTTP/1.1`;
  let signature = hmacSHA256(Buffer.from(sk), Buffer.from(message));
  let authorization: string = `hmac accesskey="${ak}", algorithm="hmac-sha256", headers="date request-line", signature="${signature}"`;
  return authorization;
}

export class SenseCodeClient implements CodeClient {
  private _idToken?: string;
  private _username?: string;
  private _avatar?: string;
  private _weaverdKey?: string;
  private _refreshToken?: string;
  private _proxy?: AuthProxy;

  constructor(private readonly meta: ClientMeta, private readonly clientConfig: ClientConfig, private debug?: (message: string, ...args: any[]) => void, proxy?: any) {
    this._proxy = proxy;
    if (this.clientConfig.key) {
      this._idToken = "XXX";
      this._username = "User";
      this._weaverdKey = "XXX";
    }
  }

  public async logout(): Promise<void> {
    if (this._proxy) {
      if (this._username) {
        this._proxy.logout({ idToken: this._idToken || "", username: this._username || "", weaverdKey: this._weaverdKey || "" })
          .then(() => {
            this._idToken = undefined;
            this._username = undefined;
            this._weaverdKey = undefined;
            this._refreshToken = undefined;
            this._avatar = undefined;
          });
      }
      return;
    }
    return axios.get(`${this.getAuthBaseUrl()}/oauth2/sessions/logout?id_token_hint=${encodeURIComponent(this._idToken || '')}&redirect_uri=${encodeURIComponent(this.meta.redirectUrl)}`)
      .then(() => {
        this._idToken = undefined;
        this._username = undefined;
        this._avatar = undefined;
        this._weaverdKey = undefined;
        this._refreshToken = undefined;
      });
  }

  public restoreAuthInfo(auth: AuthInfo): Promise<void> {
    this._idToken = auth.idToken;
    this._username = auth.username;
    this._avatar = auth.avatar;
    this._weaverdKey = auth.weaverdKey;
    this._refreshToken = auth.refreshToken;
    return Promise.resolve();
  }

  public clearAuthInfo(): Promise<void> {
    this._idToken = undefined;
    this._username = undefined;
    this._avatar = undefined;
    this._weaverdKey = undefined;
    this._refreshToken = undefined;
    return Promise.resolve();
  }

  public get state(): string {
    return crypto.createHash('sha256').update(this._weaverdKey || "").digest("base64");
  }

  public get label(): string {
    return this.clientConfig.label;
  }

  public get tokenLimit(): number {
    return this.clientConfig.tokenLimit;
  }

  public get username(): string | undefined {
    return this._username;
  }

  private async getUserAvatar(): Promise<string | undefined> {
    return Promise.resolve(undefined);
  }

  public get avatar(): string | undefined {
    return this._avatar;
  }

  public set proxy(proxy: AuthProxy | undefined) {
    this._proxy = proxy;
  }

  public get proxy(): AuthProxy | undefined {
    return this._proxy;
  }

  private async apiKeyRaw(): Promise<string> {
    if (this.clientConfig.key) {
      return Promise.resolve(this.clientConfig.key);
    }
    if (!this._weaverdKey) {
      return Promise.reject();
    }
    let info = unweaveKey(this._weaverdKey);
    if (info.aksk) {
      return Promise.resolve(Buffer.from(info.aksk, "base64").toString().trim());
    } else {
      return Promise.reject();
    }
  }

  public getAuthUrlLogin(codeVerifier: string): Promise<string | undefined> {
    if (this._proxy) {
      return this._proxy.getAuthUrlLogin();
    }
    if (this.clientConfig.key) {
      return Promise.resolve(undefined);
    }

    let baseUrl = this.getAuthBaseUrl();
    let challenge = crypto.createHash('sha256').update(codeVerifier).digest("base64url");
    let url = `${baseUrl}/oauth2/auth?response_type=code&client_id=${this.meta.clientId}&code_challenge_method=S256&code_challenge=${challenge}&redirect_uri=${this.meta.redirectUrl}&state=${baseUrl}&scope=openid%20offline%20offline_access`;
    return Promise.resolve(url);
  }

  private getAuthBaseUrl() {
    let baseUrl = 'https://signin.sensecore.cn';
    if (this.clientConfig.url.includes(".sensecoreapi.cn")) {
      baseUrl = 'https://signin.sensecore.cn';
    } else if (this.clientConfig.url.includes(".sensecoreapi.tech")) {
      baseUrl = 'https://signin.sensecore.tech';
    } else if (this.clientConfig.url.includes(".sensecoreapi.dev")) {
      baseUrl = 'https://signin.sensecore.dev';
    }
    return baseUrl;
  }

  private async tokenWeaver(data: any): Promise<AuthInfo> {
    let decoded: any = jwt_decode(data.id_token);
    let name = decoded.id_token?.username;
    let token = Buffer.from(data.access_token).toString('base64');
    let s1 = Buffer.from(`0#${name}#67pnbtbheuJyBZmsx9rz`).toString('base64');
    let s2 = token;
    s1 = s1.split("=")[0];
    s2 = s2.split("=")[0];
    let len = Math.max(s1.length, s2.length);
    let key = '';
    for (let i = 0; i < len; i++) {
      if (i < s1.length) {
        key += s1[i];
      }
      if (i === s1.length) {
        key += ',';
      }
      if (i < s2.length) {
        key += s2[i];
      }
    }
    this._idToken = data.id_token;
    this._weaverdKey = key;
    this._username = name;
    this._avatar = await this.getUserAvatar();
    this._refreshToken = data.refresh_token;
    return this.getAuthInfo();
  }

  private async loginSenseCore(code: string, codeVerifier: string, authUrl: string): Promise<AuthInfo> {
    var data = new FormData();
    data.append('client_id', this.meta.clientId);
    data.append('redirect_uri', this.meta.redirectUrl);
    data.append('grant_type', 'authorization_code');
    data.append('code_verifier', codeVerifier);
    data.append('code', code);
    data.append('state', authUrl);

    return axios.post(`${authUrl}/oauth2/token`,
      data.getBuffer(),
      {
        headers: data.getHeaders()
      })
      .then((resp) => {
        if (resp && resp.status === 200) {
          return this.tokenWeaver(resp.data);
        } else {
          return Promise.reject();
        }
      }).catch((e) => {
        return Promise.reject(e);
      });
  }

  public async login(callbackUrl: string, codeVerifer: string): Promise<AuthInfo> {
    if (this._proxy) {
      let info = await this._proxy.login(callbackUrl);
      this._idToken = info.idToken;
      this._weaverdKey = info.weaverdKey;
      this._username = info.username;
      this._avatar = info.avatar;
      this._refreshToken = info.refreshToken;
      return Promise.resolve(info);
    }
    let url = new URL(callbackUrl);
    let query = url.search?.slice(1);
    if (!query) {
      return Promise.reject();
    }
    try {
      let data = JSON.parse('{"' + decodeURIComponent(query).replace(/"/g, '\\"').replace(/&/g, '","').replace(/=/g, '":"') + '"}');
      return this.loginSenseCore(data.code, codeVerifer, data.state);
    } catch (e) {
      return Promise.reject(e);
    }
  }

  private async refreshToken(): Promise<AuthInfo> {
    if (this._proxy) {
      let ai: AuthInfo = this.getAuthInfo();
      return this._proxy.refreshToken(ai);
    }
    if (this.clientConfig.key) {
      return this.getAuthInfo();
    }
    let refreshToken = this._refreshToken;
    if (refreshToken) {
      let baseUrl = 'https://signin.sensecore.cn';
      if (this.clientConfig.url.includes(".sensecoreapi.cn")) {
        baseUrl = 'https://signin.sensecore.cn';
      } else if (this.clientConfig.url.includes(".sensecoreapi.tech")) {
        baseUrl = 'https://signin.sensecore.tech';
      } else if (this.clientConfig.url.includes(".sensecoreapi.dev")) {
        baseUrl = 'https://signin.sensecore.dev';
      }
      let url = `${baseUrl}/oauth2/token`;
      let date: string = new Date().toUTCString();
      let headers = {
        // eslint-disable-next-line @typescript-eslint/naming-convention
        "Date": date,
        // eslint-disable-next-line @typescript-eslint/naming-convention
        "Content-Type": "application/x-www-form-urlencoded"
      };
      return axios.post(url,
        `grant_type=refresh_token&client_id=${this.meta.clientId}&refresh_token=${refreshToken}&redirect_uri=${this.meta.redirectUrl}`,
        { headers })
        .then((resp) => {
          if (resp && resp.status === 200) {
            return this.tokenWeaver(resp.data);
          }
          return Promise.reject();
        }, (err) => {
          throw err;
        });
    }
    return Promise.reject();
  }

  private getAuthInfo(): AuthInfo {
    return {
      idToken: this._idToken || "",
      username: this._username || "",
      weaverdKey: this._weaverdKey || "",
      avatar: this._avatar,
      refreshToken: this._refreshToken
    };
  }

  private async _postPrompt(messages: Message[], n: number, maxToken: number, stopWord: string | undefined, stream: boolean, signal: AbortSignal, skipRetry?: boolean): Promise<any | IncomingMessage> {
    let key = await this.apiKeyRaw();
    let date: string = new Date().toUTCString();
    let auth = '';
    if (this._proxy) {
      auth = await this._proxy.checkStatus(this.getAuthInfo()).then((v) => {
        if (!v) {
          return "XXX";
        } else {
          return "";
        }
      });
    }
    if (key && auth === '') {
      if (key.includes("#")) {
        let aksk = key.split("#");
        auth = generateSignature(this.clientConfig.url, date, aksk[0], aksk[1]);
      } else {
        auth = `Bearer ${key}`;
      }
    }
    let headers = {
      // eslint-disable-next-line @typescript-eslint/naming-convention
      "Date": date,
      // eslint-disable-next-line @typescript-eslint/naming-convention
      "Content-Type": "application/json",
      // eslint-disable-next-line @typescript-eslint/naming-convention
      "Authorization": auth
    };

    let responseType: ResponseType | undefined = undefined;
    let config = { ...this.clientConfig.config };
    config.n = n;
    config.stream = stream;
    config.stop = stopWord;
    config.max_tokens = maxToken;
    if (stream) {
      responseType = "stream";
    }
    let payload = {
      messages,
      ...config
    };

    if (this.debug) {
      this.debug(`Request to: ${this.clientConfig.url}`);
      let pc = { ...payload };
      let content = pc.messages;
      pc.messages = undefined;
      this.debug(`Parameters: ${JSON.stringify(pc)}`);
      this.debug(`Prompt:\n${JSON.stringify(content)}`);
    }

    return axios
      .post(this.clientConfig.url, payload, { headers, proxy: false, timeout: 120000, responseType, signal })
      .then(async (res) => {
        if (this.debug && !stream) {
          this.debug(`${JSON.stringify(res.data)}`);
        }
        return res.data;
      }).catch(async e => {
        if (!skipRetry && e.response?.status === 401) {
          try {
            await this.refreshToken();
          } catch (er) {

          }
          return this._postPrompt(messages, n, maxToken, stopWord, stream, signal, true);
        } else {
          return Promise.reject(e);
        }
      });
  }

  public async getCompletions(messages: Message[], n: number, maxToken: number, stopWord: string | undefined, signal: AbortSignal): Promise<ResponseData> {
    return this._postPrompt(messages, n, maxToken, stopWord, false, signal).then(data => {
      let choices: Choice[] = [];
      for (let choice of data.choices) {
        choices.push({
          index: choice.index,
          message: choice.message,
          finishReason: choice.finish_reason
        });
      }
      return {
        id: data.id,
        created: data.created * 1000,
        choices
      };
    });
  }

  public getCompletionsStreaming(messages: Message[], n: number, maxToken: number, stopWord: string | undefined, signal: AbortSignal, callback: (data: ResponseData) => void) {
    this._postPrompt(messages, n, maxToken, stopWord, true, signal).then((data) => {
      if (data instanceof IncomingMessage) {
        data.on('data', async (v: any) => {
          if (signal.aborted) {
            data.destroy();
            return;
          }
          let msgstr: string = v.toString();
          if (this.debug) {
            this.debug(msgstr);
          }
          let msgs = msgstr.split("\n");
          for (let msg of msgs) {
            let content = "";
            if (msg.startsWith("data:")) {
              content = msg.slice(5).trim();
            } else if (msg.startsWith("event:")) {
              content = msg.slice(6).trim();
              if (content === "error") {
                callback({
                  id: '',
                  created: new Date().valueOf(),
                  choices: [
                    {
                      index: 0,
                      message: {
                        role: Role.assistant,
                        content: '',
                      },
                      finishReason: FinishReason.error
                    }
                  ]
                });
              }
              continue;
            }

            if (content === '[DONE]') {
              continue;
            }
            if (!content) {
              continue;
            }
            try {
              let json = JSON.parse(content);
              if (json.error) {
                callback({
                  id: json.id,
                  created: json.created * 1000,
                  choices: [
                    {
                      index: json.index,
                      message: {
                        role: Role.assistant,
                        content: json.error,
                      },
                      finishReason: FinishReason.error
                    }
                  ]
                });
                data.destroy();
                return;
              } else if (json.choices) {
                for (let choice of json.choices) {
                  let finishReason = choice["finish_reason"];
                  if (finishReason) {
                    data.destroy();
                  }
                  callback({
                    id: json.id,
                    created: json.created * 1000,
                    choices: [
                      {
                        index: choice.index,
                        message: choice.message,
                        finishReason
                      }
                    ]
                  });
                }
              }
            } catch (e) {
              throw (e);
            }
          }
        });
      } else {
        if (this.debug) {
          this.debug("Unexpected response format");
        }
      }
    }, (error) => {
      callback({
        id: '',
        created: new Date().valueOf(),
        choices: [
          {
            index: 0,
            message: {
              role: Role.assistant,
              content: error.response.statusText
            },
            finishReason: FinishReason.error
          }
        ]
      });
    });
  }

  public async sendTelemetryLog(_eventName: string, info: Record<string, any>) {
    try {
      const cfg: ClientConfig = this.clientConfig;
      let key = await this.apiKeyRaw();
      if (!key) {
        return Promise.reject();
      }

      let uri = new URL(cfg.url);
      let apiUrl = uri.origin + "/studio/ams/data/logs";
      let date: string = new Date().toUTCString();
      let auth = '';
      if (key) {
        if (key.includes("#")) {
          let aksk = key.split("#");
          auth = generateSignature(apiUrl, date, aksk[0], aksk[1]);
        } else {
          auth = `Bearer ${key}`;
        }
      }
      let headers = {
        // eslint-disable-next-line @typescript-eslint/naming-convention
        "Date": date,
        // eslint-disable-next-line @typescript-eslint/naming-convention
        "Content-Type": "application/json",
        // eslint-disable-next-line @typescript-eslint/naming-convention
        "Authorization": auth
      };
      let payload = JSON.stringify([info]);
      let user = this.username;

      return axios.post(
        apiUrl,
        payload,
        {
          // eslint-disable-next-line @typescript-eslint/naming-convention
          headers: { "X-Request-Id": user || info["common.vscodemachineid"], ...headers },
          proxy: false,
          timeout: 120000,
          transformRequest: [
            (data, header) => {
              if (!header) {
                return;
              }
              header['Content-Encoding'] = 'gzip';
              const w = zlib.createGzip();
              w.end(Buffer.from(data));
              return w;
            }
          ]
        }
      ).then(async (res) => {
        if (res?.status === 200) {
        } else {
          throw Error();
        }
      }, (err) => {
        throw err;
      });
    } catch (e) {
      return Promise.reject();
    }
  }
}