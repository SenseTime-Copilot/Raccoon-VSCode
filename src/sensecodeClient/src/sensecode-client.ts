import axios, { ResponseType } from "axios";
import FormData = require("form-data");
import jwt_decode from "jwt-decode";
import * as crypto from "crypto";
import { IncomingMessage } from "http";
import { CodeClient, AuthInfo, ResponseData, Role, ClientConfig, Choice, ResponseEvent, ChatRequestParam, ClientReqeustOptions, AuthMethod, AccessKey } from "./CodeClient";

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

  public get label(): string {
    return this.clientConfig.label;
  }

  public get maxInputTokenNum(): number {
    return this.clientConfig.maxInputTokenNum;
  }

  public get totalTokenNum(): number {
    return this.clientConfig.totalTokenNum;
  }

  public get authMethods(): AuthMethod[] {
    return [AuthMethod.browser, AuthMethod.accesskey];
  }

  public getAuthUrlLogin(codeVerifier: string): Promise<string | undefined> {
    let key = this.clientConfig.key;
    if (key && typeof key === "object") {
      let aksk = key as AccessKey;
      return Promise.resolve(`authorization://accesskey?${aksk.accessKeyId}&${aksk.secretAccessKey}`);
    }

    let baseUrl = this.getAuthBaseUrl();
    let challenge = crypto.createHash('sha256').update(codeVerifier).digest("base64").replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
    let url = `${baseUrl}/oauth2/auth?response_type=code&client_id=${this.meta.clientId}&code_challenge_method=S256&code_challenge=${challenge}&redirect_uri=${this.meta.redirectUrl}&state=${baseUrl}&scope=openid%20offline%20offline_access`;
    return Promise.resolve(url);
  }

  public async login(callbackUrl: string, codeVerifer: string): Promise<AuthInfo> {
    let url = new URL(callbackUrl);
    let query = url.search?.slice(1);
    if (!query) {
      return Promise.reject();
    }
    if (url.protocol === "authorization:") {
      let auth: AuthInfo = {
        account: {
          username: this.clientConfig.username || "User",
          userId: undefined
        },
        weaverdKey: query
      };
      return auth;
    } else {
      try {
        let data = JSON.parse('{"' + decodeURIComponent(query).replace(/"/g, '\\"').replace(/&/g, '","').replace(/=/g, '":"') + '"}');
        return this.loginSenseCore(data.code, codeVerifer, data.state);
      } catch (e) {
        return Promise.reject(e);
      }
    }
  }

  public async logout(_auth: AuthInfo): Promise<string | undefined> {
    if (this.clientConfig.key) {
      return Promise.reject(new Error("Can not clear Access Key from settings"));
    } else if (this.logoutUrl) {
      return axios.get(this.logoutUrl).then(() => {
        return undefined;
      });
    }
  }

  public onDidChangeAuthInfo(handler?: (token: AuthInfo | undefined) => void): void {
    this.onChangeAuthInfo = handler;
  }

  private async apiKeyRaw(auth: AuthInfo): Promise<string | AccessKey> {
    if (this.clientConfig.key) {
      return Promise.resolve(this.clientConfig.key);
    } else if (auth.weaverdKey) {
      let key = auth.weaverdKey;
      if (key.includes("&")) {
        let aksk = key.split("&");
        return Promise.resolve({ accessKeyId: aksk[0], secretAccessKey: aksk[1] });
      }
      return Promise.resolve(auth.weaverdKey);
    } else {
      return Promise.reject();
    }
  }

  private getAuthBaseUrl() {
    let baseUrl = 'https://signin.sensecore.cn';
    if (this.clientConfig.url.includes("ams.st-sh-01.sensecoreapi.cn")) {
      baseUrl = 'https://signin.st-sh-01.sensecore.cn';
    } else if (this.clientConfig.url.includes("ams.sensecoreapi.cn")) {
      baseUrl = 'https://signin.sensecore.cn';
    } else if (this.clientConfig.url.includes("ams.sensecoreapi.tech")) {
      baseUrl = 'https://signin.sensecore.tech';
    } else if (this.clientConfig.url.includes("ams.sensecoreapi.dev")) {
      baseUrl = 'https://signin.sensecore.dev';
    }
    return baseUrl;
  }

  private async parseAuthInfo(data: any): Promise<AuthInfo> {
    let decoded: any = jwt_decode(data.id_token);
    let name = decoded.id_token?.username;
    let ret: AuthInfo = {
      account: {
        username: this.clientConfig.username || name || "User",
        userId: name,
        avatar: undefined
      },
      refreshToken: data.refresh_token,
      expiration: decoded.exp,
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

  private async refreshToken(auth: AuthInfo): Promise<AuthInfo> {
    let baseUrl = this.getAuthBaseUrl();
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
        throw new Error();
      }, () => {
        throw new Error();
      });
  }

  private async _postPrompt(auth: AuthInfo, requestParam: ChatRequestParam, options?: ClientReqeustOptions): Promise<any | IncomingMessage> {
    let ts = new Date();
    if (!this.clientConfig.key && auth.expiration && auth.refreshToken && (ts.valueOf() / 1000 + 60) > auth.expiration) {
      try {
        let newToken = await this.refreshToken(auth);
        auth = newToken;
        if (this.onChangeAuthInfo) {
          this.onChangeAuthInfo(newToken);
        }
      } catch (er: any) {
        return Promise.reject(new Error('The authentication information has expired, please log in again'));
      }
    }

    let key = await this.apiKeyRaw(auth);
    let date: string = ts.toUTCString();
    let authHeader = '';
    if (key) {
      if (typeof key === 'string') {
        authHeader = `Bearer ${key}`;
      } else {
        let aksk = key as AccessKey;
        authHeader = generateSignature(this.clientConfig.url, date, aksk.accessKeyId, aksk.secretAccessKey);
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

    let systemPrompt = [];
    if (config.model === 'penrose-411') {
      systemPrompt.push({ role: Role.system, content: "" });
    }

    config.messages = requestParam.messages ? [...systemPrompt, ...requestParam.messages] : [];
    config.n = requestParam.n ?? 1;
    config.stream = requestParam.stream ?? config.stream;
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
      });
  }

  public async getCompletions(auth: AuthInfo, requestParam: ChatRequestParam, options?: ClientReqeustOptions): Promise<ResponseData> {
    requestParam.stream = false;
    return this._postPrompt(auth, requestParam, options).then(data => {
      let choices: Choice[] = [];
      for (let choice of data.choices) {
        let message: any;
        if (choice.message) {
          message = {
            role: choice.message.role,
            content: choice.message.content?.replace(/<\|text\|>/g, '').replace(/<\|endofblock\|>/g, '') || ""
          };
        }
        choices.push({
          index: choice.index,
          message,
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
                        content: msg,
                      }
                    }
                  ]
                }
              }));
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
                          content: json.error.message,
                        }
                      }
                    ]
                  }
                }));
              } else if (json.choices) {
                for (let choice of json.choices) {
                  let finishReason = choice["finish_reason"];
                  let message: any;
                  if (choice.message) {
                    message = {
                      role: choice.message.role,
                      content: choice.message.content?.replace(/<\|text\|>/g, '').replace(/<\|endofblock\|>/g, '') || ""
                    };
                  }
                  callback(new MessageEvent(finishReason ? ResponseEvent.finish : ResponseEvent.data,
                    {
                      data: {
                        id: json.id,
                        created: json.created * 1000,
                        choices: [
                          {
                            index: choice.index,
                            message,
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