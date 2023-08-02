import axios, { ResponseType } from "axios";
import { IncomingMessage } from "http";
import { CodeClient, AuthInfo, ClientConfig, Choice, ResponseData, Role, ResponseEvent, ChatRequestParam } from "./CodeClient";
import sign = require('jwt-encode');

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

  constructor(private readonly clientConfig: ClientConfig, private debug?: (message: string, ...args: any[]) => void) {
  }

  public async logout(_auth: AuthInfo): Promise<string | undefined> {
    if (this.clientConfig.key) {
      return Promise.reject(new Error("Not Authorized From Web"));
    } else {
      return Promise.resolve(undefined);
    }
  }

  public async setAccessKey(name: string, ak: string, sk: string): Promise<AuthInfo> {
    let ai: AuthInfo = {
      account: {
        username: name,
      },
      aksk: `${ak}#${sk}`,
      weaverdKey: "XXX",
      idToken: "XXX"
    };
    return ai;
  }

  public get label(): string {
    return this.clientConfig.label;
  }

  public get tokenLimit(): number {
    return this.clientConfig.tokenLimit;
  }

  onDidChangeAuthInfo(_handler?: (token: AuthInfo | undefined) => void): void {
  }

  public getAuthUrlLogin(_codeVerifier: string): Promise<string | undefined> {
    return Promise.resolve(undefined);
  }

  public async login(_callbackUrl: string, _codeVerifer: string): Promise<AuthInfo> {
    let ai: AuthInfo = {
      account: {
        username: "User",
      },
      weaverdKey: "XXX",
      idToken: "XXX"
    };
    return ai;
  }

  private _postPrompt(auth: AuthInfo, requestParam: ChatRequestParam, signal?: AbortSignal): Promise<any | IncomingMessage> {
    return new Promise(async (resolve, reject) => {
      let date: string = new Date().toUTCString();
      let key = this.clientConfig.key || auth.aksk;
      let authHeader = '';
      if (key) {
        if (key.includes("#")) {
          let aksk = key.split("#");
          authHeader = generateSignature(this.clientConfig.url, date, aksk[0], aksk[1]);
        } else {
          authHeader = `Bearer ${key}`;
        }
      }
      let headers = {
        // eslint-disable-next-line @typescript-eslint/naming-convention
        "Date": date,
        // eslint-disable-next-line @typescript-eslint/naming-convention
        "Content-Type": "application/json",
        // eslint-disable-next-line @typescript-eslint/naming-convention
        "Authorization": authHeader
      };

      let responseType: ResponseType | undefined = undefined;
      let config = { ...this.clientConfig.config };
      config.messages = requestParam.messages ?? [];
      config.key = undefined;
      config.stream = requestParam.stream ?? config.stream;
      config.max_new_tokens = requestParam.maxTokens ?? config.max_new_tokens;
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
        .post(this.clientConfig.url, payload, { headers, proxy: false, timeout: 120000, responseType, signal })
        .then(async (res) => {
          if (res?.status === 200) {
            resolve(res.data);
          } else {
            reject(res.data);
          }
        }, (err) => {
          reject(err);
        }).catch(e => {
          reject(e);
        });
    });
  }

  public async getCompletions(auth: AuthInfo, requestParam: ChatRequestParam, signal?: AbortSignal): Promise<ResponseData> {
    requestParam.stream = false;
    return this._postPrompt(auth, requestParam, signal).then(resp => {
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
              } else if (json.data.choices) {
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
                            index: 0,
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
    }, (err) => {
      if (this.debug) {
        this.debug(err);
      }
    });
  }

  public async sendTelemetryLog(_auth: AuthInfo, _action: string, _info: Record<string, any>) {

  }
}