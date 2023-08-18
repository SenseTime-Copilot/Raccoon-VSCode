import axios, { ResponseType } from "axios";
import { IncomingMessage } from "http";
import { CodeClient, AuthInfo, ClientConfig, Choice, ResponseData, Role, ResponseEvent, ChatRequestParam, ClientReqeustOptions } from "./CodeClient";

export class OpenAIClient implements CodeClient {
  private _username?: string;
  constructor(private readonly clientConfig: ClientConfig, private debug?: (message: string, ...args: any[]) => void) {
  }

  public async logout(_auth: AuthInfo): Promise<string | undefined> {
    if (this.clientConfig.key) {
      return Promise.reject(new Error("Can not clear Access Key from settings"));
    } else {
      return Promise.resolve(undefined);
    }
  }

  public async setAccessKey(key: string): Promise<AuthInfo> {
    this._username = this.clientConfig.username || "User";
    let auth: AuthInfo = {
      account: {
        username: this._username,
        userId: undefined
      },
      weaverdKey: key
    };
    return auth;
  }

  public get label(): string {
    return this.clientConfig.label;
  }

  get username(): string {
    return this._username || "User";
  }

  public get maxInputTokenNum(): number {
    return this.clientConfig.maxInputTokenNum;
  }

  public get totalTokenNum(): number {
    return this.clientConfig.totalTokenNum;
  }

  onDidChangeAuthInfo(_handler?: (token: AuthInfo | undefined) => void): void {
  }

  public getAuthUrlLogin(_codeVerifier: string): Promise<string | undefined> {
    return Promise.resolve(undefined);
  }

  public async login(_callbackUrl: string, _codeVerifer: string): Promise<AuthInfo> {
    return Promise.reject();
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

  private _postPrompt(auth: AuthInfo, requestParam: ChatRequestParam, options?: ClientReqeustOptions): Promise<any | IncomingMessage> {
    return new Promise(async (resolve, reject) => {
      let date: string = new Date().toUTCString();
      let headers = options ? {
        ...options?.headers
      } : {};
      headers["Date"] = date;
      headers["Content-Type"] = "application/json";

      let key = await this.apiKeyRaw(auth);
      if (key) {
        headers["Authorization"] = `Bearer ${key}`;
      }

      let responseType: ResponseType | undefined = undefined;
      let config = { ...this.clientConfig.config };
      config.messages = requestParam.messages
        ? requestParam.messages.filter((v, _idx, _arr) => {
          return v.role !== Role.system;
        })
        : [];
      config.key = undefined;
      config.stop = requestParam.stop ? requestParam.stop[0] : null;
      config.stream = requestParam.stream;
      config.max_tokens = requestParam.maxNewTokenNum ?? Math.max(32, (this.clientConfig.totalTokenNum - this.clientConfig.maxInputTokenNum));
      if (config.stream) {
        responseType = "stream";
      }

      let payload = {
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
          return reject(e);
        });
    });
  }

  public async getCompletions(auth: AuthInfo, requestParam: ChatRequestParam, options?: ClientReqeustOptions): Promise<ResponseData> {
    requestParam.stream = false;
    return this._postPrompt(auth, requestParam, options).then(resp => {
      let codeArray = resp.choices;
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
        id: resp.id,
        created: resp.created,
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
              if (json.error) {
                callback(new MessageEvent(ResponseEvent.error, {
                  data: {
                    id: '',
                    created: new Date().valueOf(),
                    choices: [
                      {
                        index: 0,
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
                  callback(new MessageEvent(finishReason ? ResponseEvent.finish : ResponseEvent.data,
                    {
                      data: {
                        id: json.id,
                        created: json.created,
                        choices: [
                          {
                            index: choice.index,
                            message: {
                              role: Role.assistant,
                              content: choice.delta.content
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
    });
  }
}