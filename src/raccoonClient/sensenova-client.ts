import axios from "axios";
import {
  EventStreamContentType,
  fetchEventSource,
} from "@fortaine/fetch-event-source";
import * as crypto from "crypto";
import jwt_decode from "jwt-decode";
import { CodeClient, AuthInfo, ClientConfig, AuthMethod, AccessKey, AccountInfo, ChatOptions, Choice, Role, FinishReason, Message, CompletionOptions } from "./CodeClient";

import sign = require('jwt-encode');

export interface SenseNovaClientMeta {
  clientId: string;
  redirectUrl: string;
}

function generateSignature(ak: string, sk: string, date: Date) {
  let t = date.valueOf();
  let data = {
    iss: ak,
    exp: Math.floor(t / 1000) + 1800,
    nbf: Math.floor(t / 1000) - 300
  };
  return "Bearer " + sign(data, sk);
}

function encrypt(dataStr: string): string {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-128-cfb', new TextEncoder().encode("senseraccoon2023"), iv);
  let ciphertext = cipher.update(dataStr, 'utf-8');

  return Buffer.concat([iv, ciphertext]).toString('base64');
}

export class SenseNovaClient implements CodeClient {
  private onChangeAuthInfo?: (token?: AuthInfo) => void;

  constructor(private readonly clientConfig: ClientConfig) {
  }

  public get robotName(): string {
    return this.clientConfig.robotname;
  }

  public get authMethods(): AuthMethod[] {
    return [AuthMethod.password, AuthMethod.accesskey];
  }

  public getAuthUrlLogin(_codeVerifier: string): Promise<string | undefined> {
    if (this.clientConfig.key) {
      return Promise.resolve(`authorization://accesskey?${encodeURIComponent(JSON.stringify(this.clientConfig.key))}`);
    }
    return Promise.resolve(undefined);
  }

  public async login(callbackUrl: string, _codeVerifer: string): Promise<AuthInfo> {
    let url = new URL(callbackUrl);
    let query = url.search?.slice(1);
    if (!query) {
      return Promise.reject();
    }
    if (url.protocol === "authorization:") {
      let logininfo = decodeURIComponent(query);
      let method = url.host || url.pathname.slice(2);
      try {
        let decoded = JSON.parse(logininfo);
        if (method === AuthMethod.accesskey) {
          return {
            account: {
              userId: decoded.accessKeyId,
              username: "User",
              userIdProvider: "Raccoon"
            },
            weaverdKey: decoded.secretAccessKey,
          };
        } else if (method === AuthMethod.password) {
          if (decoded["code"] && decoded["account"] && decoded["password"]) {
            let code = decoded["code"];
            let phone = encrypt(decoded["account"]);
            let password = encrypt(decoded["password"]);
            return axios.post(this.clientConfig.authUrl + "/login_with_password", {
              // eslint-disable-next-line @typescript-eslint/naming-convention
              nation_code: code, phone, password
            }).then(resp => {
              if (resp.status === 200 && resp.data.code === 0) {
                let jwtDecoded: any = jwt_decode(resp.data.data.access_token);
                return {
                  account: {
                    userId: jwtDecoded["iss"],
                    username: jwtDecoded["name"],
                    userIdProvider: "Raccoon"
                  },
                  expiration: jwtDecoded["exp"],
                  weaverdKey: resp.data.data.access_token,
                  refreshToken: resp.data.data.refresh_token,
                };
              }
              throw new Error(resp.data.message || resp.data);
            }).catch(err => {
              throw err;
            });
          } else {
            throw new Error("Malformed login info");
          }
        } else {
          throw new Error("Unsupported auth method");
        }
      } catch (e) {
        throw e;
      }
    } else {
      return Promise.reject(new Error("Malformed login info"));
    }
  }

  public async logout(auth: AuthInfo): Promise<string | undefined> {
    if (this.clientConfig.key) {
      return Promise.reject(new Error("Can not clear Access Key from settings"));
    } else {
      //let date = new Date();
      let headers: any = {};
      //headers["Date"] = date.toUTCString();
      headers["Content-Type"] = "application/json";
      headers["Authorization"] = `Bearer ${auth.weaverdKey}`;
      return axios.post(`${this.clientConfig.authUrl}/logout`, {}, { headers }).then(() => {
        return undefined;
      });
    }
  }

  public async syncUserInfo(auth: AuthInfo): Promise<AccountInfo> {
    let url = `${this.clientConfig.authUrl}/user_info`;
    return axios.get(url,
      {
        headers: {
          // eslint-disable-next-line @typescript-eslint/naming-convention
          Authorization: `Bearer ${auth.weaverdKey}`
        }
      })
      .then(async (resp) => {
        if (resp && resp.status === 200 && resp.data.code === 0) {
          return {
            userId: auth.account.userId,
            username: resp.data.data.name,
            userIdProvider: "Raccoon"
          };
        }
        return Promise.resolve(auth.account);
      }, (_err) => {
        return Promise.resolve(auth.account);
      });
  }

  onDidChangeAuthInfo(handler?: (token: AuthInfo | undefined) => void): void {
    this.onChangeAuthInfo = handler;
  }

  private async refreshToken(auth: AuthInfo): Promise<AuthInfo> {
    let url = `${this.clientConfig.authUrl}/refresh`;
    return axios.post(url,
      {
        // eslint-disable-next-line @typescript-eslint/naming-convention
        refresh_token: auth.refreshToken
      })
      .then(async (resp) => {
        if (resp && resp.status === 200 && resp.data.code === 0) {
          let jwtDecoded: any = jwt_decode(resp.data.data.access_token);
          return {
            account: {
              userId: auth.account.userId,
              username: jwtDecoded["name"],
              userIdProvider: "Raccoon"
            },
            expiration: jwtDecoded["exp"],
            weaverdKey: resp.data.data.access_token,
            refreshToken: resp.data.data.refresh_token,
          };
        }
        return Promise.reject(new Error("Refresh authorization token failed"));
      }, (_err) => {
        throw new Error("Authentication expired");
      });
  }

  async chat(url: string, auth: AuthInfo, options: ChatOptions): Promise<void> {
    let ts = new Date();
    if (!this.clientConfig.key && auth.expiration && auth.refreshToken && (ts.valueOf() / 1000 + (60)) > auth.expiration) {
      try {
        let newToken = await this.refreshToken(auth);
        auth = newToken;
        if (this.onChangeAuthInfo) {
          this.onChangeAuthInfo(newToken);
        }
      } catch (err: any) {
        if (this.onChangeAuthInfo) {
          this.onChangeAuthInfo();
        }
        return Promise.reject(err);
      }
    }

    let headers = options.headers || {};
    headers["Content-Type"] = "application/json";
    if (!this.clientConfig.key) {
      headers["Authorization"] = `Bearer ${auth.weaverdKey}`;
    } else {
      let aksk = this.clientConfig.key as AccessKey;
      headers["Authorization"] = generateSignature(aksk.accessKeyId, aksk.secretAccessKey, ts);
    }

    let config: any = {};
    config.model = options.config.model;
    config.stop = options.config.stop ? options.config.stop[0] : undefined;
    config.temperature = options.config.temperature;
    config.top_p = options.config.topP;
    config.repetition_penalty = options.config.repetitionPenalty;
    config.n = options.config.n ?? 1;
    config.tools = options.config.tools;
    config.tool_choice = options.config.toolChoice;

    config.stream = !!options.config.stream;
    config.max_new_tokens = options.config.maxNewTokenNum;

    const requestPayload = {
      ...config,
      messages: options.messages.filter((m) => {
        return !!m.content;
      })
    };

    const controller = new AbortController();
    options.onController?.(controller, options.thisArg);

    try {
      const chatPath = url;
      const chatPayload = {
        method: "POST",
        body: JSON.stringify(requestPayload),
        signal: controller.signal,
        headers,
      };

      // make a fetch request
      const requestTimeoutId = setTimeout(
        () => controller.abort(),
        60000,
      );

      if (config.stream) {
        let finished = false;
        const finish = () => {
          if (!finished) {
            finished = true;
            options.onFinish?.([], options.thisArg);
          }
        };

        controller.signal.onabort = finish;

        fetchEventSource(chatPath, {
          ...chatPayload,
          async onopen(res) {
            clearTimeout(requestTimeoutId);

            if (
              !res.ok ||
              !res.headers
                .get("content-type")
                ?.startsWith(EventStreamContentType) ||
              res.status !== 200
            ) {
              const responseTexts = [];
              let extraInfo = await res.clone().text();
              try {
                const resJson = await res.clone().json();
                if (resJson.error && resJson.error.message) {
                  extraInfo = resJson.error.message;
                }
              } catch { }

              if (res.status === 401) {
                responseTexts.push("Unauthorized");
              }

              if (extraInfo) {
                responseTexts.push(extraInfo);
              }

              let error: Choice = {
                index: 0,
                message: {
                  role: Role.assistant,
                  content: responseTexts.join("\n\n")
                }
              };
              options.onError?.(error, options.thisArg);
            }
          },
          onmessage(msg) {
            if (msg.data === "[DONE]" || finished) {
              return finish();
            }
            const text = msg.data;
            try {
              const json = JSON.parse(text) as {
                data: {
                  id: string;
                  usage:
                  {
                    // eslint-disable-next-line @typescript-eslint/naming-convention
                    prompt_tokens: number;
                    // eslint-disable-next-line @typescript-eslint/naming-convention
                    completion_tokens: number;
                    // eslint-disable-next-line @typescript-eslint/naming-convention
                    total_tokens: number;
                  };
                  choices: Array<{
                    index: number;
                    role: string;
                    delta: string;
                    // eslint-disable-next-line @typescript-eslint/naming-convention
                    finish_reason: FinishReason;
                  }>;
                };
              };
              let choicesCnt = json.data.choices?.length || 0;
              for (let i = 0; i < choicesCnt; i++) {
                const delta = json.data.choices[i]?.delta;
                const fr = json.data.choices[i]?.finish_reason;
                let message: Message | undefined;
                let finishReason: FinishReason | undefined;
                if (delta) {
                  message = {
                    role: json.data.choices[i].role as Role, content: delta
                  };
                }
                if (fr) {
                  finishReason = fr;
                }
                options.onUpdate?.(
                  {
                    index: json.data.choices[i]?.index || 0,
                    finishReason,
                    message
                  },
                  options.thisArg
                );
              }
            } catch (e) {
            }
          },
          onclose() {
            finish();
          },
          onerror(e) {
            let error: Choice = {
              index: 0,
              message: {
                role: Role.assistant,
                content: e.message
              }
            };
            options.onError?.(error, options.thisArg);
            throw e;
          },
          openWhenHidden: true,
        });
      } else {
        const res = await fetch(chatPath, chatPayload);
        clearTimeout(requestTimeoutId);

        const resJson = await res.json();
        if (resJson.error) {
          let error: Choice = {
            index: 0,
            message: {
              role: Role.assistant,
              content: resJson.error.message
            }
          };
          options.onError?.(error, options.thisArg);
        } else {
          let choices = resJson.data.choices;
          let c: Choice[] = [];
          for (let i = 0; i < choices.length; i++) {
            c.push({
              index: choices[i].index,
              message: {
                role: choices[i].role as Role,
                content: choices[i].message
              }
            });
          }
          options.onFinish?.(c, options.thisArg);
        }
      }
    } catch (e) {
      let error: Choice = {
        index: 0,
        message: {
          role: Role.assistant,
          content: (e as Error).message
        }
      };
      options.onError?.(error, options.thisArg);
    }
  }

  async completion(url: string, auth: AuthInfo, options: CompletionOptions): Promise<void> {
    let ts = new Date();
    if (!this.clientConfig.key && auth.expiration && auth.refreshToken && (ts.valueOf() / 1000 + (60)) > auth.expiration) {
      try {
        let newToken = await this.refreshToken(auth);
        auth = newToken;
        if (this.onChangeAuthInfo) {
          this.onChangeAuthInfo(newToken);
        }
      } catch (err: any) {
        if (this.onChangeAuthInfo) {
          this.onChangeAuthInfo();
        }
        return Promise.reject(err);
      }
    }

    let headers = options.headers || {};
    headers["Content-Type"] = "application/json";
    if (!this.clientConfig.key) {
      headers["Authorization"] = `Bearer ${auth.weaverdKey}`;
    } else {
      let aksk = this.clientConfig.key as AccessKey;
      headers["Authorization"] = generateSignature(aksk.accessKeyId, aksk.secretAccessKey, ts);
    }

    let config: any = {};
    config.model = options.config.model;
    config.stop = options.config.stop ? options.config.stop[0] : undefined;
    config.temperature = options.config.temperature;
    config.top_p = options.config.topP;
    config.repetition_penalty = options.config.repetitionPenalty;
    config.n = options.config.n ?? 1;
    config.tools = options.config.tools;
    config.tool_choice = options.config.toolChoice;

    config.stream = false;
    config.max_new_tokens = options.config.maxNewTokenNum;

    const requestPayload = {
      ...config,
      prompt: options.prompt
    };

    const controller = new AbortController();
    options.onController?.(controller, options.thisArg);

    try {
      const chatPath = url;
      const chatPayload = {
        method: "POST",
        body: JSON.stringify(requestPayload),
        signal: controller.signal,
        headers,
      };

      // make a fetch request
      const requestTimeoutId = setTimeout(
        () => controller.abort(),
        60000,
      );
      {
        const res = await fetch(chatPath, chatPayload);
        clearTimeout(requestTimeoutId);
        const resJson = await res.json();
        if (resJson.error) {
          let error: Choice = {
            index: 0,
            message: {
              role: Role.assistant,
              content: resJson.error.message
            }
          };
          options.onError?.(error, options.thisArg);
        } else {
          let choices = resJson.data.choices;
          let c: Choice[] = [];
          for (let i = 0; i < choices.length; i++) {
            c.push({
              index: choices[i].index,
              message: {
                role: Role.completion,
                content: choices[i].text
              }
            });
          }
          options.onFinish?.(c, options.thisArg);
        }
      }
    } catch (e) {
      let error: Choice = {
        index: 0,
        message: {
          role: Role.assistant,
          content: (e as Error).message
        }
      };
      options.onError?.(error, options.thisArg);
    }
  }
}