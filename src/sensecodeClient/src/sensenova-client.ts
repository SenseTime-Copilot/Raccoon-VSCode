import axios, { ResponseType } from "axios";
import jwt_decode from "jwt-decode";
import sign = require('jwt-encode');
import { IncomingMessage } from "http";
import { CodeClient, AuthInfo, ResponseData, Role, ClientConfig, Choice, ResponseEvent, ChatRequestParam, ClientReqeustOptions, AuthMethod, AccessKey } from "./CodeClient";
import { ResponseDataBuilder, handleStreamError } from "./handleStreamError";

const loginBaseUrl = 'https://login.test.sensenova.cn';
const iamBaseUrl = 'https://iam-login.test.sensenova.cn';

export interface SenseNovaClientMeta {
  clientId: string;
  redirectUrl: string;
}

function generateSignature(_urlString: string, date: Date, ak: string, sk: string) {
  let t = date.valueOf();
  let data = {
    iss: ak,
    exp: Math.floor(t / 1000) + 1800,
    nbf: Math.floor(t / 1000) - 5
  };
  return "Bearer " + sign(data, sk);
}

export class SenseNovaClient implements CodeClient {
  private onChangeAuthInfo?: (token: AuthInfo | undefined) => void;

  constructor(private readonly meta: SenseNovaClientMeta, private readonly clientConfig: ClientConfig, private debug?: (message: string, ...args: any[]) => void) {
  }

  public get label(): string {
    return this.clientConfig.label;
  }

  public get authMethods(): AuthMethod[] {
    return [AuthMethod.browser, AuthMethod.accesskey];
  }

  public getAuthUrlLogin(_codeVerifier: string): Promise<string | undefined> {
    let key = this.clientConfig.key;
    if (key && typeof key === "object") {
      let aksk = key as AccessKey;
      return Promise.resolve(`authorization://accesskey?${aksk.accessKeyId}&${aksk.secretAccessKey}`);
    }

    return Promise.resolve(`${loginBaseUrl}/#/login?redirect_url=${this.meta.redirectUrl}&refresh_expires_after=${60 * 60 * 24 * 7}`);
  }

  public async login(callbackUrl: string, _codeVerifer: string): Promise<AuthInfo> {
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
      return this.parseAuthInfo(query);
    }
  }

  public async logout(auth: AuthInfo): Promise<string | undefined> {
    if (this.clientConfig.key) {
      return Promise.reject(new Error("Can not clear Access Key from settings"));
    } else {
      let date = new Date();
      let headers: any = {};
      headers["Date"] = date.toUTCString();
      headers["Content-Type"] = "application/json";

      let key = await this.apiKeyRaw(auth);
      if (key) {
        if (typeof key === 'string') {
          headers["Authorization"] = `Bearer ${key}`;
        } else {
          let aksk = key as AccessKey;
          headers["Authorization"] = generateSignature(this.clientConfig.url, date, aksk.accessKeyId, aksk.secretAccessKey);
        }
      }
      return axios.get(`${iamBaseUrl}/sensenova-sso/v1/logout`, { headers }).then(() => {
        return undefined;
      });
    }
  }

  onDidChangeAuthInfo(handler?: (token: AuthInfo | undefined) => void): void {
    this.onChangeAuthInfo = handler;
  }

  private async parseAuthInfo(data: any): Promise<AuthInfo> {
    try {
      let decoded = JSON.parse('{"' + decodeURIComponent(data).replace(/"/g, '\\"').replace(/&/g, '","').replace(/=/g, '":"') + '"}');
      let weaverdKey = decoded.token;
      let refreshToken = decoded.refresh;
      let idToken: any = jwt_decode(weaverdKey);
      let name = idToken.email?.split("@")[0] || idToken.sub;
      let expiration = idToken.exp;
      if (!weaverdKey) {
        return Promise.reject();
      }
      let ret: AuthInfo = {
        account: {
          username: this.clientConfig.username || name || "User",
          userId: idToken.sub,
          avatar: undefined
        },
        refreshToken,
        expiration,
        weaverdKey,
      };

      return ret;
    } catch (e) {
      return Promise.reject();
    }
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

  private async refreshToken(auth: AuthInfo): Promise<AuthInfo> {
    if (this.clientConfig.key) {
      return Promise.resolve(auth);
    }
    if (auth.refreshToken) {
      let url = `${iamBaseUrl}/sensenova-sso/v1/token`;
      return axios.post(url, {
        // eslint-disable-next-line @typescript-eslint/naming-convention
        grant_type: "refresh",
        // eslint-disable-next-line @typescript-eslint/naming-convention
        refresh_token: auth.refreshToken,
        // eslint-disable-next-line @typescript-eslint/naming-convention
        expires_after: 60 * 60 * 3,
        source: 'nova'
      })
        .then((resp) => {
          if (resp && resp.status === 200) {
            let weaverdKey = resp.data.access_token;
            let refreshToken = resp.data.refresh_token;
            let idToken: any = jwt_decode(weaverdKey);
            let name = idToken.email?.split("@")[0] || idToken.sub;
            let expiration = idToken.exp;
            if (!weaverdKey) {
              return Promise.reject();
            }
            let ret: AuthInfo = {
              account: {
                username: this.clientConfig.username || name || "User",
                userId: idToken.sub,
                avatar: undefined
              },
              refreshToken,
              expiration,
              weaverdKey,
            };

            return ret;
          }
          return Promise.reject();
        }, (err) => {
          console.log(JSON.stringify(auth.refreshToken));
          console.log(JSON.stringify(err.response.data));
          throw err;
        });
    }
    return Promise.reject();
  }

  private async _postPrompt(auth: AuthInfo, requestParam: ChatRequestParam, options?: ClientReqeustOptions): Promise<any | IncomingMessage> {
    let ts = new Date();
    //if (!this.clientConfig.key && auth.expiration && auth.refreshToken && (ts.valueOf() / 1000 + (60)) > auth.expiration) {
    try {
      let newToken = await this.refreshToken(auth);
      auth = newToken;
      if (this.onChangeAuthInfo) {
        this.onChangeAuthInfo(newToken);
      }
    } catch (er: any) {
      return Promise.reject(new Error('The authentication information has expired, please log in again'));
    }
    //}

    let date = new Date();
    let headers = options ? {
      ...options?.headers
    } : {};
    headers["Date"] = date.toUTCString();
    headers["Content-Type"] = "application/json";

    let key = await this.apiKeyRaw(auth);
    if (key) {
      if (typeof key === 'string') {
        headers["Authorization"] = `Bearer ${key}`;
      } else {
        let aksk = key as AccessKey;
        headers["Authorization"] = generateSignature(this.clientConfig.url, date, aksk.accessKeyId, aksk.secretAccessKey);
      }
    }

    let responseType: ResponseType | undefined = undefined;
    let config: any = {};
    config.model = requestParam.model;
    config.stop = requestParam.stop ? requestParam.stop[0] : undefined;
    config.temperature = requestParam.temperature;

    config.stream = requestParam.stream;
    config.max_new_tokens = requestParam.maxNewTokenNum;
    if (config.stream) {
      responseType = "stream";
    }

    let payload = {
      messages: requestParam.messages.filter((m) => {
        return !!m.content;
      }),
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
      .post(this.clientConfig.url, payload, { headers, proxy: false, timeout: 120000, responseType, signal: options?.signal })
      .then(async (res) => {
        if (this.debug && !config.stream) {
          this.debug(`${JSON.stringify(res.data)}`);
        }
        return res.data;
      });
  }

  public async getCompletions(auth: AuthInfo, requestParam: ChatRequestParam, options?: ClientReqeustOptions): Promise<ResponseData> {
    requestParam.stream = false;
    return this._postPrompt(auth, requestParam, options).then(resp => {
      let codeArray = resp.data.choices;
      const choices = Array<Choice>();
      for (let i = 0; i < codeArray.length; i++) {
        const completion = codeArray[i];
        choices.push({
          index: completion.index,
          finishReason: completion.finish_reason,
          message: {
            role: Role.assistant,
            content: completion.message
          }
        });
      }
      return {
        id: resp.data.id,
        created: new Date().valueOf(),
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
            } else {
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
              if (json.status && json.status.code !== 0) {
                callback(new MessageEvent(
                  ResponseEvent.error,
                  {
                    data: new ResponseDataBuilder().append({ role: Role.assistant, content: json.status.message }).data
                  })
                );
              } else if (json.data && json.data.choices) {
                for (let choice of json.data.choices) {
                  let finishReason = choice["finish_reason"];
                  let message: any;
                  if (choice.delta) {
                    message = {
                      role: Role.assistant,
                      content: choice.message.content?.replace(/<\|text\|>/g, '').replace(/<\|endofblock\|>/g, '') || ""
                    };
                  }
                  callback(new MessageEvent(
                    finishReason ? ResponseEvent.finish : ResponseEvent.data,
                    {
                      data: new ResponseDataBuilder(json.data.id, json.created * 1000).append(message, finishReason, choice.index).data
                    })
                  );
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
        if (this.debug) {
          this.debug("Unexpected response format");
        }
        callback(new MessageEvent(ResponseEvent.error, {
          data: new ResponseDataBuilder().append({ role: Role.assistant, content: "Unexpected response format" }).data
        }));
      }
    }, (error: Error) => {
      handleStreamError(error, callback);
    });
  }
}