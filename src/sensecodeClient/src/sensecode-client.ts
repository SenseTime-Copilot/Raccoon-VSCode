import axios, { ResponseType } from "axios";
import FormData = require("form-data");
import jwt_decode from "jwt-decode";
import * as crypto from "crypto";
import { IncomingMessage } from "http";
import { CodeClient, AuthInfo, ResponseData, Role, ClientConfig, Choice, ResponseEvent, ChatRequestParam } from "./CodeClient";

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

function hmacSHA256(key: string, data: string): string {
  const hmac = crypto.createHmac('sha256', key);
  hmac.update(data);
  return hmac.digest('base64');
}

function generateSignature(urlString: string, date: string, ak: string, sk: string) {
  let url = new URL(urlString);
  let message: string = `date: ${date}\nPOST ${url.pathname} HTTP/1.1`;
  let signature = hmacSHA256(sk, message);
  let authorization: string = `hmac accesskey="${ak}", algorithm="hmac-sha256", headers="date request-line", signature="${signature}"`;
  return authorization;
}

export class SenseCodeClient implements CodeClient {
  private onChangeAuthInfo?: (token: AuthInfo | undefined) => void;

  constructor(private readonly meta: ClientMeta, private readonly clientConfig: ClientConfig, private debug?: (message: string, ...args: any[]) => void) {
  }

  public async logout(auth: AuthInfo): Promise<string | undefined> {
    if (this.clientConfig.key) {
      return Promise.reject(new Error("Not Authorized From Web"));
    } else if (!auth.logoutUrl) {
      return Promise.reject(new Error("No Logout URL"));
    } else {
      return axios.get(auth.logoutUrl).then(() => {
        return undefined;
      });
    }
  }

  public get label(): string {
    return this.clientConfig.label;
  }

  public get tokenLimit(): number {
    return this.clientConfig.tokenLimit;
  }

  onDidChangeAuthInfo(handler?: (token: AuthInfo | undefined) => void): void {
    this.onChangeAuthInfo = handler;
  }

  private async apiKeyRaw(auth: AuthInfo): Promise<string> {
    if (this.clientConfig.key) {
      return Promise.resolve(this.clientConfig.key);
    }
    if (auth.aksk) {
      return Promise.resolve(auth.aksk);
    }
    if (!auth.weaverdKey) {
      return Promise.reject();
    }
    let info = unweaveKey(auth.weaverdKey);
    if (info.aksk) {
      return Promise.resolve(Buffer.from(info.aksk, "base64").toString().trim());
    } else {
      return Promise.reject();
    }
  }

  public getAuthUrlLogin(codeVerifier: string): Promise<string | undefined> {
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
    let ret: AuthInfo = {
      account: {
        username: name,
        avatar: undefined
      },
      idToken: data.id_token,
      refreshToken: data.refresh_token,
      weaverdKey: key,
      logoutUrl: `${this.getAuthBaseUrl()}/oauth2/sessions/logout?id_token_hint=${encodeURIComponent(data.id_token || '')}&redirect_uri=${encodeURIComponent(this.meta.redirectUrl)}`,
      aksk: undefined
    };
    return ret;
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

  public async setAccessKey(name: string, ak: string, sk: string): Promise<AuthInfo> {
    let auth: AuthInfo = {
      account: {
        username: name,
      },
      aksk: `${ak}#${sk}`,
      weaverdKey: "XXX",
      idToken: "XXX"
    };
    return auth;
  }

  public async login(callbackUrl: string, codeVerifer: string): Promise<AuthInfo> {
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

  private async refreshToken(auth: AuthInfo): Promise<AuthInfo> {
    if (this.clientConfig.key) {
      let ai: AuthInfo = {
        account: {
          username: "User",
        },
        aksk: this.clientConfig.key,
        weaverdKey: "XXX",
        idToken: "XXX"
      };
      return Promise.resolve(ai);
    }
    if (auth.refreshToken) {
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
        `grant_type=refresh_token&client_id=${this.meta.clientId}&refresh_token=${auth.refreshToken}&redirect_uri=${this.meta.redirectUrl}`,
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

  private async _postPrompt(auth: AuthInfo, requestParam: ChatRequestParam, signal?: AbortSignal, skipRetry?: boolean): Promise<any | IncomingMessage> {
    let key = await this.apiKeyRaw(auth);
    let date: string = new Date().toUTCString();
    let authHeader = '';
    if (key) {
      if (key.includes("#")) {
        let aksk = key.split("#");
        authHeader = generateSignature(this.clientConfig.url, date, aksk[0], aksk[1]);
      } else {
        authHeader = `Bearer ${key}`;
      }
    }
    let user = auth.account.username;
    if (!user || user === "User") {
      user = "Unknown";
    }
    let headers = {
      // eslint-disable-next-line @typescript-eslint/naming-convention
      "Date": date,
      // eslint-disable-next-line @typescript-eslint/naming-convention
      "Content-Type": "application/json",
      // eslint-disable-next-line @typescript-eslint/naming-convention
      "Authorization": authHeader,
      // eslint-disable-next-line @typescript-eslint/naming-convention
      "x-sensecode-identity": user
    };

    let responseType: ResponseType | undefined = undefined;
    let config = { ...this.clientConfig.config };
    config.messages = requestParam.messages ?? [];
    config.n = requestParam.n ?? 1;
    config.stream = requestParam.stream ?? config.stream;
    config.stop = requestParam.stop ? requestParam.stop[0] : config.stop;
    config.max_tokens = requestParam.maxTokens ?? config.max_tokens;
    if (config.stream) {
      responseType = "stream";
    }

    if (this.debug) {
      this.debug(`Request to: ${this.clientConfig.url}`);
      let pc = { ...config };
      let content = pc.messages;
      pc.messages = undefined;
      this.debug(`Parameters: ${JSON.stringify(pc)}`);
      this.debug(`Prompt:\n${JSON.stringify(content)}`);
    }

    return axios
      .post(this.clientConfig.url, config, { headers, proxy: false, timeout: 120000, responseType, signal })
      .then(async (res) => {
        if (this.debug && !config.stream) {
          this.debug(`${JSON.stringify(res.data)}`);
        }
        return res.data;
      }).catch(async e => {
        if (!skipRetry && e.response?.status === 401) {
          let newToken: AuthInfo | undefined = undefined;
          try {
            newToken = await this.refreshToken(auth);
            if (this.onChangeAuthInfo) {
              this.onChangeAuthInfo(newToken);
            }
            if (!newToken) {
              throw new Error('Attemp to refresh access token but get nothing');
            }
            return this._postPrompt(newToken, requestParam, signal, true);
          } catch (er: any) {
            throw new Error('Attemp to refresh access token but failed');
          }
        } else {
          return Promise.reject(e);
        }
      });
  }

  public async getCompletions(auth: AuthInfo, requestParam: ChatRequestParam, signal?: AbortSignal): Promise<ResponseData> {
    requestParam.stream = false;
    return this._postPrompt(auth, requestParam, signal).then(data => {
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

  public getCompletionsStreaming(auth: AuthInfo, requestParam: ChatRequestParam, callback: (event: MessageEvent<ResponseData>) => void, signal?: AbortSignal) {
    requestParam.stream = true;
    this._postPrompt(auth, requestParam, signal).then((data) => {
      if (data instanceof IncomingMessage) {
        let tail = '';
        data.on('data', async (v: any) => {
          if (signal?.aborted) {
            data.destroy();
            callback(new MessageEvent(ResponseEvent.cancel));
            return;
          }
          let msgstr: string = v.toString();
          if (this.debug) {
            this.debug(msgstr);
          }
          let msgs = (tail + msgstr)
            .split("\n")
            .filter((str, _idx, _arr) => {
              return !!str;
            });
          for (let msg of msgs) {
            let content = "";
            if (msg.startsWith("data:")) {
              content = msg.slice(5).trim();
            } else if (msg.startsWith("event:")) {
              content = msg.slice(6).trim();
              if (content === "error") {
                callback(new MessageEvent(ResponseEvent.error, {
                  data: {
                    id: '',
                    created: new Date().valueOf(),
                    choices: [
                      {
                        index: 0,
                        message: {
                          role: Role.assistant,
                          content: '',
                        }
                      }
                    ]
                  }
                }));
              }
              continue;
            }

            if (content === '[DONE]') {
              data.destroy();
              callback(new MessageEvent(ResponseEvent.done));
              return;
            }
            if (!content) {
              continue;
            }
            try {
              let json = JSON.parse(content);
              tail = "";
              if (json.error) {
                callback(new MessageEvent(ResponseEvent.error, {
                  data: {
                    id: json.id,
                    created: json.created * 1000,
                    choices: [
                      {
                        index: json.index,
                        message: {
                          role: Role.assistant,
                          content: json.error,
                        }
                      }
                    ]
                  }
                }));
              } else if (json.choices) {
                for (let choice of json.choices) {
                  let finishReason = choice["finish_reason"];
                  callback(new MessageEvent(finishReason ? ResponseEvent.finish : ResponseEvent.data,
                    {
                      data: {
                        id: json.id,
                        created: json.created * 1000,
                        choices: [
                          {
                            index: choice.index,
                            message: choice.message,
                            finishReason
                          }
                        ]
                      }
                    }));
                }
              }
            } catch (e: any) {
              if (!tail && e.stack?.startsWith("SyntaxError")) {
                tail = content;
                continue;
              }
              throw (e);
            }
          }
        });
      } else {
        callback(new MessageEvent(ResponseEvent.error, {
          data: {
            id: '',
            created: new Date().valueOf(),
            choices: [
              {
                index: 0,
                message: {
                  role: Role.assistant,
                  content: "Unexpected response format",
                }
              }
            ]
          }
        }));
      }
    }, (error) => {
      callback(new MessageEvent(ResponseEvent.error, {
        data: {
          id: '',
          created: new Date().valueOf(),
          choices: [
            {
              index: 0,
              message: {
                role: Role.assistant,
                content: error.response?.statusText || error.message
              }
            }
          ]
        }
      }));
    }).catch(err => {
      callback(new MessageEvent(ResponseEvent.error, {
        data: {
          id: '',
          created: new Date().valueOf(),
          choices: [
            {
              index: 0,
              message: {
                role: Role.assistant,
                content: err.message,
              }
            }
          ]
        }
      }));
    });
  }

  public async sendTelemetryLog(auth: AuthInfo, action: string, info: Record<string, any>) {
    try {
      const cfg: ClientConfig = this.clientConfig;
      let key = await this.apiKeyRaw(auth);
      if (!key) {
        return Promise.reject();
      }

      let date: string = new Date().toUTCString();
      let authHeader = '';
      if (key) {
        if (key.includes("#")) {
          let aksk = key.split("#");
          authHeader = generateSignature(cfg.url, date, aksk[0], aksk[1]);
        } else {
          authHeader = `Bearer ${key}`;
        }
      }
      let user = auth.account.username;
      if (!user || user === "User") {
        user = "Unknown";
      }

      let headers = {
        // eslint-disable-next-line @typescript-eslint/naming-convention
        "Date": date,
        // eslint-disable-next-line @typescript-eslint/naming-convention
        "Content-Type": "application/json",
        // eslint-disable-next-line @typescript-eslint/naming-convention
        "Authorization": authHeader,
        // eslint-disable-next-line @typescript-eslint/naming-convention
        "x-sensecode-identity": user,
        // eslint-disable-next-line @typescript-eslint/naming-convention
        "x-sensecode-action": action
      };
      let payload = JSON.stringify([info]);

      return axios.post(
        cfg.url,
        payload,
        {
          headers,
          proxy: false,
          timeout: 120000
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