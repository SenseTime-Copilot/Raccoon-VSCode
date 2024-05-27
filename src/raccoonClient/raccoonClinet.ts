import axios from "axios";
import {
  EventStreamContentType,
  fetchEventSource,
} from "@fortaine/fetch-event-source";
import * as crypto from "crypto";
import jwt_decode from "jwt-decode";
import { CodeClient, AuthInfo, ClientConfig, AuthMethod, AccessKey, AccountInfo, ChatOptions, Choice, Role, FinishReason, Message, CompletionOptions, Organization, MetricType, KnowledgeBase, Captcha, browserLoginParam, smsLoginParam, phoneLoginParam, emailLoginParam, accessKeyLoginParam } from "./CodeClient";

import sign = require('jwt-encode');

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

export class RaccoonClient implements CodeClient {
  private onChangeAuthInfo?: (token?: AuthInfo) => void;
  private log?: (message: string, ...args: any[]) => void;

  constructor(private readonly clientConfig: ClientConfig) {
  }

  setLogger(log?: (message: string, ...args: any[]) => void) {
    this.log = log;
  }

  public get robotName(): string {
    return this.clientConfig.robotname;
  }

  public get authMethods(): AuthMethod[] {
    return [AuthMethod.phone, AuthMethod.sms, AuthMethod.email, AuthMethod.accesskey];
  }

  public getAuthUrlLogin(_codeVerifier: string): Promise<string | undefined> {
    return Promise.resolve(undefined);
  }

  async getCaptcha(timeoutMs?: number): Promise<Captcha | undefined> {
    return axios.get(this.clientConfig.apiBaseUrl + "/auth/v1/captcha", { timeout: timeoutMs }).then((resp) => {
      if (resp.status === 200) {
        let c: Captcha = {
          uuid: resp.data.data.captcha_uuid,
          image: resp.data.data.captcha_image
        }
        return c;
      }
      return undefined;
    }).catch((e) => {
      return undefined;
    });
  }

  async sendSMS(captchaUuid: string, code: string, nationCode: string, phone: string): Promise<void> {
    return axios.post(
      this.clientConfig.apiBaseUrl + "/auth/v1/send_sms",
      {
        captcha_result: code,
        captcha_uuid: captchaUuid,
        nation_code: nationCode,
        phone: encrypt(phone)
      }
    );
  }

  public async login(param?: accessKeyLoginParam | browserLoginParam | smsLoginParam | phoneLoginParam | emailLoginParam): Promise<AuthInfo> {
    if (!param) {
      let k = this.clientConfig.key;
      if (k && typeof k === "object" && "secretAccessKey" in k) {
        let kp = k as AccessKey;
        return {
          account: {
            userId: kp.accessKeyId,
            username: this.clientConfig.username || "User",
            pro: false
          },
          weaverdKey: kp.secretAccessKey,
        };
      }
      return Promise.reject(new Error("No preset auth info"));
    }
    return this._login(param).then((v) => {
      return this.syncUserInfo(v).then((info) => {
        return { ...v, account: info };
      }, () => v);
    });
  }

  async _login(param: accessKeyLoginParam | browserLoginParam | smsLoginParam | phoneLoginParam | emailLoginParam): Promise<AuthInfo> {
    if (param.type === "browser") {
      let _p = param as browserLoginParam;
      return Promise.reject();
    } else if (param.type === AuthMethod.accesskey) {
      let p = param as accessKeyLoginParam;
      return {
        account: {
          userId: p.accessKeyId,
          username: "User",
          pro: false
        },
        weaverdKey: p.secretAccessKey,
      };
    } else if (param.type === AuthMethod.sms) {
      let p = param as smsLoginParam;
      return axios.post(this.clientConfig.apiBaseUrl + "/auth/v1/login_with_sms", {
        // eslint-disable-next-line @typescript-eslint/naming-convention
        nation_code: p.nationCode, phone: encrypt(p.phone), sms_code: p.smsCode
      }).then(resp => {
        if (resp.status === 200 && resp.data.code === 0) {
          let jwtDecoded: any = jwt_decode(resp.data.data.access_token);
          return {
            account: {
              userId: jwtDecoded["iss"],
              username: jwtDecoded["name"],
              pro: false
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
    } else if (param.type === AuthMethod.phone) {
      let p = param as phoneLoginParam;
      return axios.post(this.clientConfig.apiBaseUrl + "/auth/v1/login_with_password", {
        // eslint-disable-next-line @typescript-eslint/naming-convention
        nation_code: p.nationCode, phone: encrypt(p.phone), password: encrypt(p.password)
      }).then(resp => {
        if (resp.status === 200 && resp.data.code === 0) {
          let jwtDecoded: any = jwt_decode(resp.data.data.access_token);
          return {
            account: {
              userId: jwtDecoded["iss"],
              username: jwtDecoded["name"],
              pro: false
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
    } else if (param.type === AuthMethod.email) {
      let p = param as emailLoginParam;
      return axios.post(this.clientConfig.apiBaseUrl + "/auth/v1/login_with_email_password", {
        email: p.email, password: encrypt(p.password)
      }).then(resp => {
        if (resp.status === 200 && resp.data.code === 0) {
          let jwtDecoded: any = jwt_decode(resp.data.data.access_token);
          return {
            account: {
              userId: jwtDecoded["iss"],
              username: jwtDecoded["name"],
              pro: false
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
      return Promise.reject(new Error("Not supported login method"));
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
      return axios.post(`${this.clientConfig.apiBaseUrl}/auth/v1/logout`, {}, { headers }).then(() => {
        return undefined;
      });
    }
  }

  public async syncUserInfo(auth: AuthInfo, timeoutMs?: number): Promise<AccountInfo> {
    let url = `${this.clientConfig.apiBaseUrl}/auth/v1/user_info`;
    let ts = new Date();
    if (!this.clientConfig.key && auth.expiration && auth.refreshToken && (ts.valueOf() / 1000 + (60)) > auth.expiration) {
      try {
        this.log?.('syncUserInfo trigger token refresh');
        auth = await this.refreshToken(auth);
      } catch (err: any) {
        return Promise.reject(err);
      }
    }

    return axios.get(url,
      {
        headers: {
          // eslint-disable-next-line @typescript-eslint/naming-convention
          Authorization: `Bearer ${auth.weaverdKey}`
        },
        timeout: timeoutMs
      })
      .then(async (resp) => {
        if (resp && resp.status === 200 && resp.data.code === 0 && resp.data.data) {
          let orgs = resp.data.data.orgs;
          let username = resp.data.data.name;
          let pro = resp.data.data.pro_code_enabled;
          let organizations: Organization[] = [];
          if (orgs) {
            for (let org of orgs) {
              organizations.push({
                code: org.code,
                name: org.name,
                username: org.user_name || username,
                status: org.user_status
              });
            }
          }
          let info: AccountInfo = {
            userId: auth.account.userId,
            username,
            pro,
            organizations
          };
          return info;
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
    let url = `${this.clientConfig.apiBaseUrl}/auth/v1/refresh`;
    let log = this.log;
    log?.(url);
    log?.(`refresh_token: ${auth.refreshToken}`);

    return axios.post(url,
      {
        // eslint-disable-next-line @typescript-eslint/naming-convention
        refresh_token: auth.refreshToken
      },
      {
        timeout: 2000
      })
      .then(async (resp) => {
        if (resp && resp.status === 200 && resp.data.code === 0) {
          let jwtDecoded: any = jwt_decode(resp.data.data.access_token);
          let newAuth: AuthInfo = {
            account: {
              userId: auth.account.userId,
              username: jwtDecoded["name"],
              pro: auth.account.pro,
              organizations: auth.account.organizations
            },
            expiration: jwtDecoded["exp"],
            weaverdKey: resp.data.data.access_token,
            refreshToken: resp.data.data.refresh_token,
          };
          this.onChangeAuthInfo?.(newAuth);
          return newAuth;
        }
        if (resp && resp.status === 401) {
          this.onChangeAuthInfo?.();
          throw new Error("Authentication expired");
        }
        return auth;
      }, (_err) => {
        return auth;
      });
  }

  private async chatUsingFetch(auth: AuthInfo, options: ChatOptions, org?: Organization) {
    let ts = new Date();
    let url = options.config.urlOverwrite || `${this.clientConfig.apiBaseUrl}/llm/v1/chat-completions`;
    let headers = options.headers || {};
    headers["Content-Type"] = "application/json";
    headers["x-raccoon-user-id"] = auth.account.userId || "";
    if (org) {
      headers["x-org-code"] = org.code;
      url = options.config.urlOverwrite || `${this.clientConfig.apiBaseUrl}/org/llm/v1/chat-completions`;
    }
    if (!this.clientConfig.key) {
      headers["Authorization"] = `Bearer ${auth.weaverdKey}`;
    } else if (typeof this.clientConfig.key === "string") {
      headers["Authorization"] = `Bearer ${this.clientConfig.key}`;
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
    config.know_ids = options.config.knowledgeBases?.map((kb, _idx, _arr) => kb.code);

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

    let tokenRevoke = (() => {
      this.onChangeAuthInfo?.();
    }).bind(this);

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

      let log = this.log;

      log?.(chatPath);
      log?.(JSON.stringify(headers, undefined, 2));
      log?.(JSON.stringify(requestPayload, undefined, 2));

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
          async onopen(res: Response) {
            clearTimeout(requestTimeoutId);
            if (log) {
              let hh: any = {};
              res.headers.forEach((v, k, _h) => {
                hh[k] = v;
              });
              log(JSON.stringify(hh, undefined, 2));
            }
            if (res.status === 200 && options.onHeader) {
              options.onHeader(res.headers);
            }
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
                tokenRevoke();
              }

              if (extraInfo) {
                responseTexts.push(extraInfo);
              }

              let error: Choice = {
                index: res.status,
                message: {
                  role: Role.assistant,
                  content: responseTexts.join("\n\n")
                }
              };
              log?.(JSON.stringify(error, undefined, 2));
              options.onError?.(error, options.thisArg);
              controller.abort();
            }
          },
          onmessage(msg: any) {
            log?.(msg.data);
            if (msg.data === "[DONE]" || finished) {
              return finish();
            }
            const text = msg.data;
            try {
              /* eslint-disable @typescript-eslint/naming-convention */
              const json = JSON.parse(text) as {
                data: {
                  id: string;
                  usage:
                  {
                    prompt_tokens: number;
                    completion_tokens: number;
                    total_tokens: number;
                  };
                  choices: Array<{
                    index: number;
                    role: string;
                    delta: string;
                    finish_reason: FinishReason;
                  }>;
                };
              };
              /* eslint-enable */
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
          onerror(e: any) {
            if (controller.signal.aborted) {
              return;
            }
            let error: Choice = {
              index: e.cause.errno,
              message: {
                role: Role.assistant,
                content: e.cause.message
              }
            };
            log?.(JSON.stringify(error, undefined, 2));
            options.onError?.(error, options.thisArg);
            controller.abort();
          },
          openWhenHidden: true,
        });
      } else {
        const res: Response = await fetch(chatPath, chatPayload);
        clearTimeout(requestTimeoutId);

        if (log) {
          let hh: any = {};
          res.headers.forEach((v, k, _h) => {
            hh[k] = v;
          });
          log(JSON.stringify(hh, undefined, 2));
        }

        const resJson = await res.json();
        if (!res.ok) {
          const responseTexts = [];
          if (res.status === 401) {
            responseTexts.push("Unauthorized");
            tokenRevoke();
          }

          responseTexts.push(JSON.stringify(resJson));

          let error: Choice = {
            index: res.status,
            message: {
              role: Role.assistant,
              content: responseTexts.join("\n\n")
            }
          };
          log?.(JSON.stringify(error, undefined, 2));
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
          log?.(JSON.stringify(c, undefined, 2));
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
      this.log?.(JSON.stringify(error, undefined, 2));
      options.onError?.(error, options.thisArg);
    }
  }

  async chat(auth: AuthInfo, options: ChatOptions, org?: Organization): Promise<void> {
    let ts = new Date();
    if (!this.clientConfig.key && auth.expiration && auth.refreshToken && (ts.valueOf() / 1000 + (60)) > auth.expiration) {
      try {
        this.log?.('chat trigger token refresh');
        auth = await this.refreshToken(auth);
      } catch (err: any) {
        return Promise.reject(err);
      }
    }

    return this.chatUsingFetch(auth, options, org);
  }

  async completionUsingFetch(auth: AuthInfo, options: CompletionOptions, org?: Organization): Promise<void> {
    let ts = new Date();
    let headers = options.headers || {};
    let url = options.config.urlOverwrite || `${this.clientConfig.apiBaseUrl}/llm/v1/completions`;
    headers["Content-Type"] = "application/json";
    headers["x-raccoon-user-id"] = auth.account.userId || "";
    if (org) {
      headers["x-org-code"] = org.code;
      url = options.config.urlOverwrite || `${this.clientConfig.apiBaseUrl}/org/llm/v1/completions`;
    }
    if (!this.clientConfig.key) {
      headers["Authorization"] = `Bearer ${auth.weaverdKey}`;
    } else if (typeof this.clientConfig.key === "string") {
      headers["Authorization"] = `Bearer ${this.clientConfig.key}`;
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
        this.log?.(chatPath);
        this.log?.(JSON.stringify(headers, undefined, 2));
        this.log?.(JSON.stringify(requestPayload, undefined, 2));
        const res = await fetch(chatPath, chatPayload);
        clearTimeout(requestTimeoutId);
        if (this.log) {
          let hh: any = {};
          res.headers.forEach((v, k, _h) => {
            hh[k] = v;
          });
          this.log(JSON.stringify(hh, undefined, 2));
        }
        const resJson = await res.json();
        if (!res.ok) {
          if (res.status === 401) {
            this.onChangeAuthInfo?.();
          }
          let error: Choice = {
            index: res.status,
            message: {
              role: Role.assistant,
              content: JSON.stringify(resJson)
            }
          };
          this.log?.(JSON.stringify(error, undefined, 2));
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
          this.log?.(JSON.stringify(c, undefined, 2));
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
      this.log?.(JSON.stringify(error, undefined, 2));
      options.onError?.(error, options.thisArg);
    }
  }

  async completion(auth: AuthInfo, options: CompletionOptions, org?: Organization): Promise<void> {
    let ts = new Date();
    if (!this.clientConfig.key && auth.expiration && auth.refreshToken && (ts.valueOf() / 1000 + (60)) > auth.expiration) {
      try {
        this.log?.('completion trigger token refresh');
        auth = await this.refreshToken(auth);
      } catch (err: any) {
        return Promise.reject(err);
      }
    }
    return this.completionUsingFetch(auth, options, org);
  }

  public async listKnowledgeBase(auth: AuthInfo, org?: Organization, timeoutMs?: number): Promise<KnowledgeBase[]> {
    let listUrl = `${this.clientConfig.apiBaseUrl}${org ? "/org" : ""}/knowledge_base/v1/knowledge_bases`;
    if (!auth.account.pro && !org) {
      return [];
    }
    let ts = new Date();
    if (!this.clientConfig.key && auth.expiration && auth.refreshToken && (ts.valueOf() / 1000 + (60)) > auth.expiration) {
      try {
        this.log?.('listKnowledgeBase trigger token refresh');
        auth = await this.refreshToken(auth);
      } catch (err: any) {
        return Promise.reject(err);
      }
    }

    return axios.get(listUrl, {
      headers: {
        // eslint-disable-next-line @typescript-eslint/naming-convention
        Authorization: `Bearer ${auth.weaverdKey}`,
        // eslint-disable-next-line @typescript-eslint/naming-convention
        "x-org-code": org?.code
      },
      timeout: timeoutMs || 2000
    }).then((response) => {
      return response.data?.data?.knowledge_bases || [];
    });
  }

  public async sendTelemetry(auth: AuthInfo, org: Organization | undefined, metricType: MetricType, common: Record<string, any>, metric: Record<string, any> | undefined) {
    let telementryUrl = `${this.clientConfig.apiBaseUrl}${org ? "/org" : ""}/b/v1/m`;
    let metricInfo: any = {};
    metricInfo[metricType] = metric;
    metricInfo['metric_type'] = metricType.replace("_", "-");
    let ts = new Date();
    if (!this.clientConfig.key && auth.expiration && auth.refreshToken && (ts.valueOf() / 1000 + (60)) > auth.expiration) {
      try {
        this.log?.('sendTelemetry trigger token refresh');
        auth = await this.refreshToken(auth);
      } catch (err: any) {
        return Promise.reject(err);
      }
    }
    return axios.post(telementryUrl,
      {
        // eslint-disable-next-line @typescript-eslint/naming-convention
        common_header: common,
        metrics: [metricInfo],
      },
      {
        headers: {
          // eslint-disable-next-line @typescript-eslint/naming-convention
          Authorization: `Bearer ${auth.weaverdKey}`,
          // eslint-disable-next-line @typescript-eslint/naming-convention
          "x-org-code": org?.code
        },
        timeout: 2000
      }
    ).then(() => { });
    /* eslint-enable */
  }
}