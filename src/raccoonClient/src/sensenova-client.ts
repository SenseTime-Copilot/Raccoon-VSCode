import axios, { AxiosError, ResponseType } from "axios";
import jwt_decode from "jwt-decode";
import sign = require('jwt-encode');
import { IncomingMessage } from "http";
import { CodeClient, AuthInfo, ResponseData, Role, ClientConfig, Choice, ResponseEvent, ChatRequestParam, ClientReqeustOptions, AuthMethod, AccessKey, AccountInfo } from "./CodeClient";
import { ResponseDataBuilder, handleStreamError } from "./handleStreamError";

export interface SenseNovaClientMeta {
  clientId: string;
  redirectUrl: string;
}

function generateSignature(_urlString: string, date: Date) {
  let t = date.valueOf();
  let data = {
    iss: "2SVR6XdhiZ8hvUTwI2AHVjdT1FH",
    exp: Math.floor(t / 1000) + 1800,
    nbf: Math.floor(t / 1000) - 300
  };
  return "Bearer " + sign(data, '4rPbIhmiuRK4pZiT8ddbLn0Mr7SVeZ4r');
}

export class SenseNovaClient implements CodeClient {
  private readonly iamBaseUrl = 'https://chat.sensetime.com';
  private onChangeAuthInfo?: (token?: AuthInfo) => void;

  constructor(private readonly meta: SenseNovaClientMeta, private readonly clientConfig: ClientConfig, private debug?: (message: string, ...args: any[]) => void) {
  }

  public get robotName(): string {
    return this.clientConfig.robotname;
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

    return Promise.resolve(`${this.iamBaseUrl}/wb/login?redirect_uri=${this.meta.redirectUrl}`);
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
      let tokenString = decodeURIComponent(query);
      try {
        let decoded = JSON.parse('{"' + tokenString.replace(/"/g, '\\"').replace(/&/g, '","').replace(/=/g, '":"') + '"}');
        if (decoded["id_token"]) {
          return this.parseAuthInfoLDAP(decoded["id_token"]);
        } else if (decoded["token"] && decoded["refresh"]) {
          return this.parseAuthInfo(decoded["token"], decoded["refresh"]);
        } else {
          throw new Error();
        }
      } catch (e) {
        return Promise.reject(new Error("Malformed access token"));
      }
    }
  }

  public async logout(auth: AuthInfo): Promise<string | undefined> {
    if (this.clientConfig.key) {
      return Promise.reject(new Error("Can not clear Access Key from settings"));
    } else if (auth.account.userIdProvider === 'SenseTime LDAP') {
      return Promise.resolve('SenseTime LDAP');
    } else {
      let date = new Date();
      let headers: any = {};
      headers["Date"] = date.toUTCString();
      headers["Content-Type"] = "application/json";
      headers["Authorization"] = `Bearer ${auth.weaverdKey}`;
      return axios.post(`${this.iamBaseUrl}/api/auth/v1.0.2/logout`, {}, { headers }).then(() => {
        return undefined;
      });
    }
  }

  onDidChangeAuthInfo(handler?: (token: AuthInfo | undefined) => void): void {
    this.onChangeAuthInfo = handler;
  }

  private async getAccountInfo(token: string): Promise<AccountInfo> {
    return axios.get(`${this.iamBaseUrl}/api/auth/v1.0.4/check`, {
      headers: {
        // eslint-disable-next-line @typescript-eslint/naming-convention
        Authorization: `Bearer ${token}`
      }
    }).then((resp) => {
      if (resp.status === 200 && resp.data.mobile) {
        let userinfo = resp.data;
        let name: string = '';
        if (userinfo.neck_name) {
          name = userinfo.neck_name;
        } else if (userinfo.user_name) {
          name = userinfo.user_name;
        } else if (userinfo.mobile) {
          name = userinfo.mobile.substring(0, 3) + '****' + userinfo.mobile.substring(7);
        }
        if (name) {
          return {
            username: this.clientConfig.username || name || "User",
            userIdProvider: "SenseChat",
            userId: userinfo.user_id,
            avatar: userinfo.head
          };
        }
      }
      throw new Error(JSON.stringify(resp.data));
    });
  }

  private async parseAuthInfo(weaverdKey: string, refreshToken: string): Promise<AuthInfo> {
    let idToken: any = jwt_decode(weaverdKey);
    let expiration = idToken.exp;
    return this.getAccountInfo(weaverdKey).then((account) => {
      return {
        account,
        refreshToken,
        expiration,
        weaverdKey,
      };
    });
  }

  private async avatar(name: string | undefined, token: string): Promise<string | undefined> {
    return axios.get(`https://gitlab.bj.sensetime.com/api/v4/users?username=${name}`,
      {
        // eslint-disable-next-line @typescript-eslint/naming-convention
        headers: { "PRIVATE-TOKEN": token }
      })
      .then(
        (res1) => {
          if (res1?.status === 200) {
            if (res1.data[0]) {
              return res1.data[0].avatar_url;
            }
          } else {
            return undefined;
          }
        },
        (_reason) => {
          return undefined;
        }
      );
  }

  private async parseAuthInfoLDAP(weaverdKey: string): Promise<AuthInfo> {
    let idToken: any = jwt_decode(weaverdKey);
    let name = idToken.username;
    let ret: AuthInfo = {
      account: {
        username: this.clientConfig.username || name || "User",
        userIdProvider: "SenseTime LDAP",
        userId: name,
        avatar: await this.avatar(name, "67pnbtbheuJyBZmsx9rz")
      },
      weaverdKey: "67pnbtbheuJyBZmsx9rz"
    };
    return ret;
  }

  private getAccountInfoLDAP(token: string): Promise<AccountInfo> {
    return axios.get(`https://gitlab.bj.sensetime.com/api/v4/user`,
      {
        // eslint-disable-next-line @typescript-eslint/naming-convention
        headers: { "PRIVATE-TOKEN": token }
      })
      .then(
        (res) => {
          if (res.status === 200) {
            return {
              username: 'ok'
            };
          } else {
            return Promise.reject();
          }
        },
        (_reason) => {
          return Promise.reject();
        }
      ).catch((_e) => {
        return Promise.reject();
      });
  }

  private async refreshToken(auth: AuthInfo): Promise<AuthInfo> {
    let url = `${this.iamBaseUrl}/api/auth/v1.0.4/refresh`;
    return axios.post(url,
      {
        // eslint-disable-next-line @typescript-eslint/naming-convention
        access: auth.weaverdKey,
        // eslint-disable-next-line @typescript-eslint/naming-convention
        refresh: auth.refreshToken
      })
      .then(async (resp) => {
        if (resp && resp.status === 200) {
          let weaverdKey = resp.data.access;
          let refreshToken = resp.data.refresh || auth.refreshToken;
          let idToken: any = jwt_decode(weaverdKey);
          let expiration = idToken.exp;
          return this.getAccountInfo(weaverdKey).then((account) => {
            return {
              account,
              refreshToken,
              expiration,
              weaverdKey
            };
          });
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

    let check = undefined;
    if (auth.account.userIdProvider === 'SenseTime LDAP') {
      check = this.getAccountInfoLDAP(auth.weaverdKey);
    } else {
      check = this.getAccountInfo(auth.weaverdKey);
    }

    return check.then(
      async (_account: AccountInfo) => {
        let date = new Date();
        let headers = options ? {
          ...options?.headers
        } : {};
        headers["x-raccoon-client"] = 'SenseNova';
        headers["x-raccoon-id-provider"] = auth.account.userIdProvider || "";
        headers["x-raccoon-user-id"] = auth.account.userId || "";
        headers["Date"] = date.toUTCString();
        headers["Content-Type"] = "application/json";
        headers["Authorization"] = generateSignature(requestParam.url, date);

        let responseType: ResponseType | undefined = undefined;
        let config: any = {};
        config.model = requestParam.model;
        config.stop = requestParam.stop ? requestParam.stop[0] : undefined;
        config.temperature = requestParam.temperature;
        config.n = requestParam.n ?? 1;

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
    );
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
            content: completion.message || completion.text
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
    }, (error: AxiosError) => {
      handleStreamError(error, callback);
    });
  }
}