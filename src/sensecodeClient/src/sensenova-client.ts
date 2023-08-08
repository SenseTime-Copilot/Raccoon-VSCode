import axios, { ResponseType } from "axios";
import { IncomingMessage } from "http";
import { CodeClient, AuthInfo, ClientConfig, Choice, ResponseData, Role, ResponseEvent, ChatRequestParam, ClientReqeustOptions } from "./CodeClient";
import sign = require('jwt-encode');

export interface SenseNovaClientMeta {
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
    base64key: tokenKey[1]
  };
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

  constructor(private readonly meta: SenseNovaClientMeta, private readonly clientConfig: ClientConfig, private debug?: (message: string, ...args: any[]) => void) {
  }

  public async logout(_auth: AuthInfo): Promise<string | undefined> {
    if (this.clientConfig.key) {
      return Promise.reject(new Error("Not Authorized From Web"));
    } else {
      return Promise.resolve(undefined);
    }
  }

  private calcKey(name: any, token: string) {
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
    return key;
  }

  public async setAccessKey(name: string, ak: string, sk: string): Promise<AuthInfo> {
    let token = Buffer.from(`${ak}#${sk}`).toString('base64');
    let auth: AuthInfo = {
      account: {
        username: name,
      },
      weaverdKey: this.calcKey(name, token)
    };
    return auth;
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
    return Promise.resolve(`https://login.sensenova.cn/#/login?redirect_url=${this.meta.redirectUrl}`);
  }

  public async login(_callbackUrl: string, _codeVerifer: string): Promise<AuthInfo> {
    let ai: AuthInfo = {
      account: {
        username: "User",
      },
      weaverdKey: "XXX"
    };
    return ai;
  }

  private async apiKeyRaw(auth: AuthInfo): Promise<string> {
    if (this.clientConfig.key) {
      return Promise.resolve(this.clientConfig.key);
    }
    if (!auth.weaverdKey) {
      return Promise.reject();
    }
    let info = unweaveKey(auth.weaverdKey);
    if (info.base64key) {
      return Promise.resolve(Buffer.from(info.base64key, "base64").toString().trim());
    } else {
      return Promise.reject();
    }
  }

  private _postPrompt(auth: AuthInfo, requestParam: ChatRequestParam, options?: ClientReqeustOptions): Promise<any | IncomingMessage> {
    return new Promise(async (resolve, reject) => {
      let date: string = new Date().toUTCString();
      let key = await this.apiKeyRaw(auth);
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
      headers["X-Sensenova-Token"] = 'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJleHAiOjE2OTE0ODU5NDgsImp0aSI6Ijk5MGFmOGQyLWJlZDUtNGZjOC05MTA5LWFlM2JmZGZlMjliMiIsImlhdCI6MTY5MTQ1NzE0OCwiaXNzIjoic3NvLnNlbnNlbm92YS5jb20iLCJuYmYiOjE2OTE0NTcxNDgsInN1YiI6IjE4NDEzNTU4MzczNDQ3NjI3MCIsInR5cGUiOiJwYXNzd29yZCIsInNvdXJjZSI6Im5vdmEifQ.MjfYcJ7Mqgw6tGbPt46ndqhz-2snmzFIuu2GYH3Py5kCjCop8SOna1ETaLP0GnJr8G8VRQYsjYXBhWxz8J3o8y-l0g0gASSPMOGEADC8npCqbkVbD_6s_FdVAJXqXsqXD0hQmNS-eMVfPM-ZLZTIqXs5TITYswM-hyHNnWPbEWUsPNoONwHJx2GY0JFDqbB70YzL9-iV4RPKAndfnhjn66rNIWdCQa7QG5vtvfD77nGmmNu2AQw1j2L6tk7bKfte_7Kgr8mCC7bjq9YvQfCTBaItVzdlNY_Ekk1B-nLoEqVUx21tM6Vt_EmjGRu1BaeQo9O6zk_s1TCaPNlNLgIojw';

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
        .post(this.clientConfig.url, payload, { headers, proxy: false, timeout: 120000, responseType, signal: options?.signal })
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

  public async sendTelemetryLog(_auth: AuthInfo, _action: string, _info: Record<string, any>) {
  }
}