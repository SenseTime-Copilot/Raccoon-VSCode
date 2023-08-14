import axios, { ResponseType } from "axios";
import FormData = require("form-data");
import jwt_decode from "jwt-decode";
import * as crypto from "crypto";
import { IncomingMessage } from "http";
import { CodeClient, AuthInfo, ResponseData, Role, ClientConfig, Choice, ResponseEvent, ChatRequestParam, ClientReqeustOptions } from "./CodeClient";

export interface SenseCodeClientMeta {
  clientId: string;
  redirectUrl: string;
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
  private logoutUrl?: string;
  private onChangeAuthInfo?: (token: AuthInfo | undefined) => void;

  constructor(private readonly meta: SenseCodeClientMeta, private readonly clientConfig: ClientConfig, private debug?: (message: string, ...args: any[]) => void) {
  }

  public async logout(_auth: AuthInfo): Promise<string | undefined> {
    if (this.clientConfig.key) {
      return Promise.reject(new Error("Not Authorized From Web"));
    } else if (this.logoutUrl) {
      return axios.get(this.logoutUrl).then(() => {
        return undefined;
      });
    }
  }

  public get label(): string {
    return this.clientConfig.label;
  }

  public get maxInputTokenNum(): number {
    return this.clientConfig.maxInputTokenNum;
  }

  public get totalTokenNum(): number {
    return this.clientConfig.totalTokenNum;
  }

  onDidChangeAuthInfo(handler?: (token: AuthInfo | undefined) => void): void {
    this.onChangeAuthInfo = handler;
  }

  private async apiKeyRaw(auth: AuthInfo): Promise<string> {
    if (this.clientConfig.key) {
      return Promise.resolve(this.clientConfig.key);
    } else if (auth.weaverdKey) {
      return Promise.resolve(auth.weaverdKey);
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

  private async parseAuthInfo(data: any): Promise<AuthInfo> {
    let decoded: any = jwt_decode(data.id_token);
    let name = decoded.id_token?.username;
    let ret: AuthInfo = {
      account: {
        username: name || "User",
        avatar: undefined
      },
      refreshToken: data.refresh_token,
      weaverdKey: data.access_token,
    };

    this.logoutUrl = `${this.getAuthBaseUrl()}/oauth2/sessions/logout?id_token_hint=${encodeURIComponent(data.id_token || '')}&redirect_uri=${encodeURIComponent(this.meta.redirectUrl)}`;

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
          return this.parseAuthInfo(resp.data);
        } else {
          return Promise.reject();
        }
      }).catch((e) => {
        return Promise.reject(e);
      });
  }

  public async setAccessKey(ak: string, sk: string): Promise<AuthInfo> {
    let auth: AuthInfo = {
      account: {
        username: "User",
      },
      weaverdKey: `${ak}#${sk}`
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
      return Promise.resolve(auth);
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
            return this.parseAuthInfo(resp.data);
          }
          return Promise.reject();
        }, (err) => {
          throw err;
        });
    }
    return Promise.reject();
  }

  private async _postPrompt(auth: AuthInfo, requestParam: ChatRequestParam, options?: ClientReqeustOptions, skipRetry?: boolean): Promise<any | IncomingMessage> {
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

    let headers = options ? {
      ...options?.headers
    } : {};
    headers["Date"] = date;
    headers["Content-Type"] = "application/json";
    headers["Authorization"] = authHeader;

    let responseType: ResponseType | undefined = undefined;
    let config = { ...this.clientConfig.config };
    config.messages = requestParam.messages ?? [];
    config.n = requestParam.n ?? 1;
    config.stream = requestParam.stream ?? config.stream;
    config.stop = requestParam.stop ? requestParam.stop[0] : config.stop;
    config.max_tokens = requestParam.maxNewTokenNum ?? Math.max(32, (this.clientConfig.totalTokenNum - this.clientConfig.maxInputTokenNum));
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
      .post(this.clientConfig.url, config, { headers, proxy: false, timeout: 120000, responseType, signal: options?.signal })
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
              return Promise.reject(new Error('Attemp to refresh access token but get nothing'));
            }
            return this._postPrompt(newToken, requestParam, options, true);
          } catch (er: any) {
            return Promise.reject(new Error('Attemp to refresh access token but failed'));
          }
        } else {
          return Promise.reject(e);
        }
      });
  }

  public async getCompletions(auth: AuthInfo, requestParam: ChatRequestParam, options?: ClientReqeustOptions): Promise<ResponseData> {
    requestParam.stream = false;
    return this._postPrompt(auth, requestParam, options).then(data => {
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

  public getCompletionsStreaming(auth: AuthInfo, requestParam: ChatRequestParam, callback: (event: MessageEvent<ResponseData>) => void, options?: ClientReqeustOptions) {
    requestParam.stream = true;
    this._postPrompt(auth, requestParam, options).then((data) => {
      if (data instanceof IncomingMessage) {
        let tail = '';
        data.on('data', async (v: any) => {
          if (options?.signal?.aborted) {
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
    });
  }
}