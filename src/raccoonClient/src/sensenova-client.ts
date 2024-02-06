import axios, { AxiosError, ResponseType } from "axios";
import * as crypto from "crypto";
import jwt_decode from "jwt-decode";
import { IncomingMessage } from "http";
import { CodeClient, AuthInfo, ResponseData, Role, ClientConfig, Choice, ResponseEvent, ChatRequestParam, ClientReqeustOptions, AuthMethod, AccessKey, AccountInfo, Message } from "./CodeClient";
import { ResponseDataBuilder, handleStreamError } from "./handleStreamError";

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

  constructor(private readonly clientConfig: ClientConfig, private debug?: (message: string, ...args: any[]) => void) {
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

  private async _postPrompt(auth: AuthInfo, requestParam: ChatRequestParam, options?: ClientReqeustOptions): Promise<any | IncomingMessage> {
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

    let date = new Date();
    let headers = options ? {
      ...options?.headers
    } : {};
    //headers["Date"] = date.toUTCString();
    headers["Content-Type"] = "application/json";
    if (!this.clientConfig.key) {
      headers["Authorization"] = `Bearer ${auth.weaverdKey}`;
    } else {
      let aksk = this.clientConfig.key as AccessKey;
      headers["Authorization"] = generateSignature(aksk.accessKeyId, aksk.secretAccessKey, date);
    }

    let responseType: ResponseType | undefined = undefined;
    let config: any = {};
    config.model = requestParam.model;
    config.stop = requestParam.stop ? requestParam.stop[0] : undefined;
    config.temperature = requestParam.temperature;
    config.top_p = requestParam.topP;
    config.repetition_penalty = requestParam.repetitionPenalty;
    config.n = requestParam.n ?? 1;
    config.tools = requestParam.tools;
    config.tool_choice = requestParam.toolChoice;

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

    if (payload.messages && payload.messages[0] && payload.messages[0].role === Role.completion) {
      payload.prompt = payload.messages[0].content;
      payload.messages = undefined;
    }

    if (this.debug) {
      this.debug(`Request to: ${requestParam.url}`);
      let pc = { ...payload };
      let content = pc.messages;
      pc.messages = undefined;
      this.debug(`Parameters: ${JSON.stringify(pc)}`);
      this.debug(`Prompt:\n${JSON.stringify(content)}`);
    }

    return axios
      .post(requestParam.url, payload, { headers, proxy: false, timeout: 120000, responseType, signal: options?.signal })
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
        let message: Message | undefined;
        if (completion.message || completion.text) {
          message = {
            role: Role.assistant,
            content: completion.message || completion.text
          };
        }
        choices.push({
          index: completion.index,
          finishReason: completion.finish_reason,
          message,
          toolCalls: completion.tool_calls
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
          tail = "";
          for (let msg of msgs) {
            let content = "";
            if (msg.startsWith("data:")) {
              content = msg.slice(5).trim();
            } else {
              tail += msg;
              continue;
            }

            if (content === '[DONE]') {
              data.destroy();
              callback(new MessageEvent(ResponseEvent.done));
              return;
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
                  let created = json.created && json.created * 1000;
                  if (choice.delta) {
                    message = {
                      role: Role.assistant,
                      content: choice.delta || ""
                    };
                  }
                  callback(new MessageEvent(
                    finishReason ? ResponseEvent.finish : ResponseEvent.data,
                    {
                      data: new ResponseDataBuilder(json.data.id, created).append(message, finishReason, choice.index).data
                    })
                  );
                }
              }
            } catch (e: any) {
              if (e.stack?.startsWith("SyntaxError")) {
                tail += msg;
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
    }, (error: AxiosError) => {
      handleStreamError(error, callback);
    });
  }
}