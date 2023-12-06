import axios, { ResponseType } from "axios";
import { IncomingMessage } from "http";
import { CodeClient, AuthInfo, ResponseData, Role, ClientConfig, Choice, ResponseEvent, ChatRequestParam, ClientReqeustOptions, AuthMethod, AccountInfo } from "./CodeClient";

export class TGIClient implements CodeClient {
  constructor(private readonly clientConfig: ClientConfig, private debug?: (message: string, ...args: any[]) => void) {
  }

  public get robotName(): string {
    return this.clientConfig.robotname;
  }

  public get authMethods(): AuthMethod[] {
    return [];
  }

  public getAuthUrlLogin(_codeVerifier: string): Promise<string | undefined> {
    return Promise.resolve(`authorization://apikey?${this.clientConfig.key}`);
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
      return Promise.reject();
    }
  }

  public async logout(_auth: AuthInfo): Promise<string | undefined> {
    if (this.clientConfig.key) {
      return Promise.reject(new Error("Can not clear Access Key from settings"));
    } else {
      return Promise.resolve(undefined);
    }
  }

  public async syncUserInfo(auth: AuthInfo): Promise<AccountInfo> {
    return Promise.resolve(auth.account);
  }

  public onDidChangeAuthInfo(_handler?: (token: AuthInfo | undefined) => void): void {
  }

  private async _postPrompt(auth: AuthInfo, requestParam: ChatRequestParam, options?: ClientReqeustOptions): Promise<any | IncomingMessage> {
    let headers = options ? {
      ...options?.headers
    } : {};
    headers["Content-Type"] = "application/json";

    let responseType: ResponseType | undefined = undefined;
    let config: any = {};
    config.inputs = requestParam.messages.map((v, _i, _arr) => `${v.content}`).join("");
    config.stream = requestParam.stream;
    config.parameters = {
      model: requestParam.model,
      stop: requestParam.stop,
      temperature: requestParam.temperature,
      n: requestParam.n ?? 1,
      // eslint-disable-next-line @typescript-eslint/naming-convention
      max_new_tokens: requestParam.maxNewTokenNum
    };

    if (config.stream) {
      responseType = "stream";
    }

    if (this.debug) {
      this.debug(`Request to: ${requestParam.url}`);
      let pc = { ...config };
      let content = pc.inputs;
      pc.inputs = undefined;
      this.debug(`Parameters: ${JSON.stringify(pc)}`);
      this.debug(`Prompt:\n${JSON.stringify(content)}`);
    }

    return axios
      .post(requestParam.url, config, { headers, proxy: false, timeout: 120000, responseType, signal: options?.signal })
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
      if (data.generated_text) {
        choices.push({
          index: 0,
          message: {
            role: Role.assistant,
            content: data.generated_text
          }
        });
      }
      return {
        id: "0",
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
            let content = msg;

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
              } else if (json.generated_text) {
                callback(new MessageEvent(ResponseEvent.data,
                  {
                    data: {
                      id: "0",
                      created: new Date().valueOf(),
                      choices: [
                        {
                          index: 0,
                          message: {
                            role: Role.assistant,
                            content: json.generated_text
                          }
                        }
                      ]
                    }
                  }));
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