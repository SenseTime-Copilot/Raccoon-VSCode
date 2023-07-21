import axios, { ResponseType } from "axios";
import * as crypto from "crypto";
import { IncomingMessage } from "http";
import { CodeClient, AuthInfo, AuthProxy, ClientConfig, Choice, FinishReason, ResponseData, Role, Message, ResponseEvent } from "./CodeClient";
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
  private _idToken?: string;
  private _username?: string;
  private _weaverdKey?: string;
  private _aksk?: string;
  private onChangeAuthInfo?: (client: CodeClient, token?: AuthInfo, refresh?: boolean) => Promise<void>;

  constructor(private readonly clientConfig: ClientConfig, private debug?: (message: string, ...args: any[]) => void) {
    if (clientConfig.key) {
      this._username = "User";
    }
  }

  onDidChangeAuthInfo(handler?: (client: CodeClient, token?: AuthInfo, refresh?: boolean) => Promise<void>): void {
    this.onChangeAuthInfo = handler;
  }

  public async logout(): Promise<void> {
    return this.clearAuthInfo();
  }

  public async setAccessKey(name: string, ak: string, sk: string): Promise<AuthInfo> {
    this._username = name;
    this._aksk = `${ak}#${sk}`;
    return this.getAuthInfo();
  }

  public restoreAuthInfo(auth: AuthInfo): Promise<void> {
    this._idToken = auth.idToken;
    this._username = auth.username;
    this._weaverdKey = auth.weaverdKey;
    this._aksk = auth.aksk;
    return Promise.resolve();
  }

  public async clearAuthInfo(): Promise<void> {
    this._idToken = undefined;
    this._username = undefined;
    this._weaverdKey = undefined;
    this._aksk = undefined;
    if (this.onChangeAuthInfo) {
      await this.onChangeAuthInfo(this);
    }
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

  public get avatar(): string | undefined {
    return undefined;
  }

  public set proxy(proxy: AuthProxy | undefined) {
  }

  public get proxy(): AuthProxy | undefined {
    return undefined;
  }

  public getAuthUrlLogin(_codeVerifier: string): Promise<string | undefined> {
    return Promise.resolve(undefined);
  }

  public async login(_callbackUrl: string, _codeVerifer: string): Promise<AuthInfo> {
    return this.getAuthInfo();
  }

  private getAuthInfo(): AuthInfo {
    return {
      username: this._username || "User",
      aksk: this._aksk,
      weaverdKey: this._weaverdKey || "XXX",
      idToken: this._idToken || "XXX"
    };
  }

  private _postPrompt(messages: Message[], n: number, maxToken: number, stopWord: string | undefined, stream: boolean, signal: AbortSignal): Promise<any | IncomingMessage> {
    return new Promise(async (resolve, reject) => {
      let date: string = new Date().toUTCString();
      let key = this.clientConfig.key || this._aksk;
      let auth = '';
      if (key) {
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
      config.key = undefined;
      config.stream = stream;
      config.max_new_tokens = maxToken;
      if (stream) {
        responseType = "stream";
      }

      let payload = {
        messages: messages.filter((m) => {
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

  public async getCompletions(messages: Message[], n: number, maxToken: number, stopWord: string | undefined, signal: AbortSignal): Promise<ResponseData> {
    return this._postPrompt(messages, n, maxToken, stopWord, false, signal).then(resp => {
      let codeArray = resp.data.choices;
      const choices = Array<Choice>();
      for (let i = 0; i < codeArray.length; i++) {
        const completion = codeArray[i];
        let finishReason: FinishReason = FinishReason.length;
        if (completion.finish_reason === 'length') {
          finishReason = FinishReason.length;
        } else if (completion.finish_reason === 'stop') {
          finishReason = FinishReason.stop;
        } else if (completion.finish_reason === 'eos') {
          finishReason = FinishReason.eos;
        }
        choices.push({
          index: completion.index,
          finishReason,
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

  public getCompletionsStreaming(messages: Message[], n: number, maxToken: number, stopWord: string | undefined, signal: AbortSignal, callback: (event: ResponseEvent, data?: ResponseData) => void) {
    this._postPrompt(messages, n, maxToken, stopWord, true, signal).then((data) => {
      if (data instanceof IncomingMessage) {
        let tail = '';
        data.on('data', async (v: any) => {
          if (signal.aborted) {
            data.destroy();
            callback(ResponseEvent.cancel);
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
              callback(ResponseEvent.done);
              return;
            }
            if (!content) {
              continue;
            }
            try {
              let json = JSON.parse(content);
              tail = "";
              if (json.error) {
                callback(ResponseEvent.error, {
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
                });
              } else if (json.data.choices) {
                for (let choice of json.data.choices) {
                  let value = choice.delta;
                  let finishReason = choice["finish_reason"];
                  callback(finishReason ? ResponseEvent.finish : ResponseEvent.data,
                    {
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
                    });
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
        callback(ResponseEvent.error, {
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
        });
      }
    }, (err) => {
      callback(ResponseEvent.error, {
        id: '',
        created: new Date().valueOf(),
        choices: [
          {
            index: 0,
            message: {
              role: Role.assistant,
              content: err.message || err.response?.statusText || "Unknwon error"
            }
          }
        ]
      });
    });
  }

  public async sendTelemetryLog(_eventName: string, info: Record<string, any>) {
    try {
      const cfg: ClientConfig = this.clientConfig;
      let key = cfg.key;
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