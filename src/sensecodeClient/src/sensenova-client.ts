import axios, { ResponseType } from "axios";
import { IncomingMessage } from "http";
import { CodeClient, AuthInfo, ClientConfig, Choice, ResponseData, Role, ResponseEvent, ChatRequestParam, ClientReqeustOptions } from "./CodeClient";
import jwt_decode from "jwt-decode";
import sign = require('jwt-encode');

export interface SenseNovaClientMeta {
  clientId: string;
  redirectUrl: string;
}

function generateSignature(_urlString: string, _date: string, ak: string, sk: string) {
  let t = new Date().valueOf();
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

  public async logout(_auth: AuthInfo): Promise<string | undefined> {
    if (this.clientConfig.key) {
      return Promise.reject(new Error("Not Authorized From Web"));
    } else {
      return Promise.resolve(undefined);
    }
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

  public getAuthUrlLogin(_codeVerifier: string): Promise<string | undefined> {
    return Promise.resolve(undefined);
    return Promise.resolve(`https://login.stage.sensenova.cn/#/login?redirect_url=${this.meta.redirectUrl}`);
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

    return ret;
  }

  public async login(callbackUrl: string, _codeVerifer: string): Promise<AuthInfo> {
    let url = new URL(callbackUrl);
    let query = url.search?.slice(1);
    if (false) {
      if (!query) {
        return Promise.reject();
      }

      return this.parseAuthInfo(query);
    } else {
      query = 'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJleHAiOjE2OTE1MTk4MzMsImp0aSI6IjEzMmJmMjFkLWNlNzQtNDI2Ni04NDE2LTAzZTkxMWNhZmM3OSIsImlhdCI6MTY5MTQ5MTAzMywiaXNzIjoic3NvLnNlbnNlbm92YS5jb20iLCJuYmYiOjE2OTE0OTEwMzMsInN1YiI6IjE5MDYzNDA3Mjg0NDgxNzA2OSIsInR5cGUiOiJwYXNzd29yZCIsInNvdXJjZSI6Im5vdmEifQ.FXpTQ8XZkOXO8GSdOoFeqpPZJXbrvEq1TGGBk3EjO8eL2WNEj6u-y7SEPETyGllfDSdKCcm1GmOJFAWuiakbazQQniKtbGfkPMx51g3tVOF-775bjHeWkgWUQGCPT_GSLl1U8SrKqfvKvtzfZ-dgDEBAce0CzVhXcHqcLRigTvMJJdtxptikIUpn1xT_FQls842bHDCKopeqy1k918qH1Fbhq--_wMgTDmKiqgXHXjcfUp_0x4fY5Rv0bKdHeb_B1-5kULnQtbG8bf5aKsKjnTTPrMNxfBXs4uBnxTFVJRVjVw6f3KUei_dklCFbH9ljHXmAGlXAWFP5sIUmb5_cHw';
      let refreshToken = 'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJleHAiOjE2OTE1MTk4MzMsImp0aSI6IjEzMmJmMjFkLWNlNzQtNDI2Ni04NDE2LTAzZTkxMWNhZmM3OSIsImlhdCI6MTY5MTQ5MTAzMywiaXNzIjoic3NvLnNlbnNlbm92YS5jb20iLCJuYmYiOjE2OTE0OTEwMzMsInN1YiI6IjE5MDYzNDA3Mjg0NDgxNzA2OSIsInR5cGUiOiJwYXNzd29yZCIsInNvdXJjZSI6Im5vdmEifQ.FXpTQ8XZkOXO8GSdOoFeqpPZJXbrvEq1TGGBk3EjO8eL2WNEj6u-y7SEPETyGllfDSdKCcm1GmOJFAWuiakbazQQniKtbGfkPMx51g3tVOF-775bjHeWkgWUQGCPT_GSLl1U8SrKqfvKvtzfZ-dgDEBAce0CzVhXcHqcLRigTvMJJdtxptikIUpn1xT_FQls842bHDCKopeqy1k918qH1Fbhq--_wMgTDmKiqgXHXjcfUp_0x4fY5Rv0bKdHeb_B1-5kULnQtbG8bf5aKsKjnTTPrMNxfBXs4uBnxTFVJRVjVw6f3KUei_dklCFbH9ljHXmAGlXAWFP5sIUmb5_cHw';

      return {
        account: {
          username: "User"
        },
        weaverdKey: query,
        refreshToken
      };
    }
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

  private async refreshToken(auth: AuthInfo): Promise<AuthInfo> {
    if (this.clientConfig.key) {
      return Promise.resolve(auth);
    }
    if (auth.refreshToken) {
      let url = `/oauth2/token`;
      return axios.post(url)
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

  private _postPrompt(auth: AuthInfo, requestParam: ChatRequestParam, options?: ClientReqeustOptions, skipRetry?: boolean): Promise<any | IncomingMessage> {
    return new Promise(async (resolve, reject) => {
      let date: string = new Date().toUTCString();
      let headers = options ? {
        ...options?.headers
      } : {};
      headers["Date"] = date;
      headers["Content-Type"] = "application/json";

      let key = await this.apiKeyRaw(auth);
      if (key) {
        if (key.includes("#")) {
          let aksk = key.split("#");
          headers["Authorization"] = generateSignature(this.clientConfig.url, date, aksk[0], aksk[1]);
        } else {
          headers["X-Sensenova-Token"] = key;
        }
      }

      let responseType: ResponseType | undefined = undefined;
      let config = { ...this.clientConfig.config };
      config.messages = requestParam.messages
        ? requestParam.messages.filter((v, _idx, _arr) => {
          return v.role !== Role.system;
        })
        : [];
      config.key = undefined;
      config.stop = requestParam.stop ? requestParam.stop[0] : undefined;
      config.stream = requestParam.stream;
      config.max_new_tokens = requestParam.maxNewTokenNum ?? Math.max(32, (this.clientConfig.totalTokenNum - this.clientConfig.maxInputTokenNum));
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

      axios
        .post(this.clientConfig.url, payload, { headers, proxy: false, timeout: 120000, responseType, signal: options?.signal })
        .then(async (res) => {
          if (res?.status === 200) {
            resolve(res.data);
          } else {
            reject(res.data);
          }
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
              return this._postPrompt(newToken, requestParam, options, true);
            } catch (er: any) {
              throw new Error('Attemp to refresh access token but failed');
            }
          } else {
            return reject(e);
          }
        });
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
            content: completion.message.content
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
                callback(new MessageEvent(ResponseEvent.error, {
                  data: {
                    id: '',
                    created: new Date().valueOf(),
                    choices: [
                      {
                        index: 0,
                        message: {
                          role: Role.assistant,
                          content: json.status.message,
                        }
                      }
                    ]
                  }
                }));
              } else if (json.data && json.data.choices) {
                for (let choice of json.data.choices) {
                  let value = choice.delta;
                  let finishReason = choice["finish_reason"];
                  callback(new MessageEvent(finishReason ? ResponseEvent.finish : ResponseEvent.data,
                    {
                      data: {
                        id: json.data.id,
                        created: new Date().valueOf(),
                        choices: [
                          {
                            index: choice.index,
                            message: {
                              role: Role.assistant,
                              content: value
                            },
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
        if (this.debug) {
          this.debug("Unexpected response format");
        }
        callback(new MessageEvent(ResponseEvent.error, {
          data: {
            id: '',
            created: new Date().valueOf(),
            choices: [
              {
                index: 0,
                message: {
                  role: Role.assistant,
                  content: "Unexpected response format"
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
}