import axios from "axios";
import {
  EventStreamContentType,
  fetchEventSource,
} from "@fortaine/fetch-event-source";
import * as crypto from "crypto";
import jwt_decode from "jwt-decode";
import { CodeClient, AuthInfo, ClientConfig, AuthMethod, AccessKey, AccountInfo, ChatOptions, Choice, Role, FinishReason, Message, CompletionOptions, Organization, MetricType, KnowledgeBase, BrowserLoginParam, PhoneLoginParam, EmailLoginParam, AccessKeyLoginParam, Reference, UrlType } from "./CodeClient";

import hbs = require("handlebars");
import sign = require('jwt-encode');
import { supportedLanguages } from "./getSupportedLanguages";

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
  private auth?: AuthInfo;

  constructor(private readonly clientConfig: ClientConfig) {
    let k = this.clientConfig.key;
    if (k && typeof k === "object" && "secretAccessKey" in k) {
      let kp = k as AccessKey;
      let auth = {
        account: {
          userId: kp.accessKeyId,
          username: "User",
          pro: false
        },
        weaverdKey: kp.secretAccessKey,
      };
      this.auth = { ...auth };
    }
  }

  setLogger(log?: (message: string, ...args: any[]) => void) {
    this.log = log;
  }

  public get robotName(): string {
    return this.clientConfig.robotname;
  }

  public get authMethods(): AuthMethod[] {
    return this.clientConfig.authMethod;
  }

  public url(type: UrlType): string {
    switch (type) {
      case UrlType.base:
        return this.clientConfig.baseUrl;
      case UrlType.signup:
        return this.clientConfig.baseUrl + "/register";
      case UrlType.login:
        return this.clientConfig.baseUrl + "/login";
      case UrlType.forgetPassword:
        return this.clientConfig.baseUrl + "/login?step=forget-password";
    }
  }

  public getAuthUrlLogin(_codeVerifier: string): Promise<string | undefined> {
    return Promise.resolve(this.clientConfig.baseUrl + "/login");
  }

  public async login(param?: AccessKeyLoginParam | BrowserLoginParam | PhoneLoginParam | EmailLoginParam): Promise<AuthInfo> {
    if (!param) {
      if (this.clientConfig.key && this.auth) {
        return this.auth;
      }
      return Promise.reject(new Error("No preset auth info"));
    }
    return this._login(param).then((v) => {
      this.auth = { ...v };
      return this.syncUserInfo().then((info) => {
        let auth = { ...v, account: info };
        this.auth = { ...auth };
        return auth;
      }, () => v);
    });
  }

  async _login(param: AccessKeyLoginParam | BrowserLoginParam | PhoneLoginParam | EmailLoginParam): Promise<AuthInfo> {
    if (param.type === "browser") {
      let p = param as BrowserLoginParam;
      let code = '';
      p.callbackParam.trim()
        .split('&')
        .forEach(item => {
          let kv = item.split('=');
          if (kv[0] === 'authorization_code') {
            code = kv[1];
          }
        });
      if (code) {
        return axios.post(
          this.clientConfig.baseUrl + "/api/plugin/auth/v1/login_with_authorization_code",
          {
            // eslint-disable-next-line @typescript-eslint/naming-convention
            "authorization_code": code
          }
        ).then((resp) => {
          if (resp.status === 200 && resp.data.data) {
            let jwtDecoded: any = jwt_decode(resp.data.data.access_token);
            return {
              account: {
                userId: jwtDecoded["iss"],
                username: jwtDecoded["name"],
                pro: false
              },
              expiration: jwtDecoded["exp"],
              weaverdKey: resp.data.data.access_token,
              refreshToken: resp.data.data.refresh_token
            };
          }
          return Promise.reject();
        });
      }
      return Promise.reject();
    } else if (param.type === AuthMethod.accesskey) {
      let p = param as AccessKeyLoginParam;
      return {
        account: {
          userId: p.accessKeyId,
          username: "User",
          pro: false
        },
        weaverdKey: p.secretAccessKey,
      };
    } else if (param.type === AuthMethod.phone) {
      let p = param as PhoneLoginParam;
      return axios.post(this.clientConfig.baseUrl + "/api/plugin/auth/v1/login_with_password", {
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
      let p = param as EmailLoginParam;
      return axios.post(this.clientConfig.baseUrl + "/api/plugin/auth/v1/login_with_email_password", {
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

  public restoreAuthInfo(auth?: AuthInfo): "SET" | "RESET" | "UPDATE" {
    if (this.clientConfig.key) {
      return "UPDATE";
    }
    if (auth) {
      let set = false;
      if (!this.auth) {
        set = true;
      }
      this.auth = auth;
      return set ? "SET" : "UPDATE";
    } else {
      let reset = false;
      if (this.auth) {
        reset = true;
      }
      this.auth = auth;
      return reset ? "RESET" : "UPDATE";
    }
  }

  public getAuthInfo(): AuthInfo | undefined {
    return this.auth;
  }

  public async logout(): Promise<string | undefined> {
    if (this.clientConfig.key) {
      return Promise.reject(new Error("Can not clear Access Key from settings"));
    } else if (!this.auth) {
      return Promise.reject(new Error("Not login yet"));
    } else {
      //let date = new Date();
      let headers: any = {};
      //headers["Date"] = date.toUTCString();
      headers["Content-Type"] = "application/json";
      headers["Authorization"] = `Bearer ${this.auth.weaverdKey}`;
      this.auth = undefined;
      return axios.post(`${this.clientConfig.baseUrl}/api/plugin/auth/v1/logout`, {}, { headers }).then(() => {
        return undefined;
      });
    }
  }

  public async syncUserInfo(timeoutMs?: number): Promise<AccountInfo> {
    let url = `${this.clientConfig.baseUrl}/api/plugin/auth/v1/user_info`;
    let ts = new Date();
    let auth = this.auth;
    if (!auth) {
      return Promise.reject();
    }
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
            userId: auth?.account.userId || "",
            username,
            pro,
            organizations
          };
          if (this.auth) {
            this.auth.account = info;
          }
          return info;
        }
        return Promise.resolve(auth!.account);
      }, (_err) => {
        return Promise.resolve(auth!.account);
      });
  }

  onDidChangeAuthInfo(handler?: (token: AuthInfo | undefined) => void): void {
    this.onChangeAuthInfo = handler;
  }

  private async refreshToken(auth: AuthInfo): Promise<AuthInfo> {
    let url = `${this.clientConfig.baseUrl}/api/plugin/auth/v1/refresh`;
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
    let url = options.config.urlOverwrite || `${this.clientConfig.baseUrl}/api/plugin/llm/v1/chat-completions`;
    let headers = options.headers || {};
    headers["Content-Type"] = "application/json";
    headers["x-raccoon-user-id"] = auth.account.userId || "";
    if (org) {
      headers["x-org-code"] = org.code;
      url = options.config.urlOverwrite || `${this.clientConfig.baseUrl}/api/plugin/org/llm/v1/chat-completions`;
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
    let reversedMessages: Message[] = [];
    let len = 0;
    for (let idx = options.messages.length - 1; idx >= 0; idx--) {
      let v = options.messages[idx];
      let newLen = len + v.content.length;
      if (newLen < options.maxInputTokens * 3) {
        reversedMessages.push(v);
      } else {
        break;
      }
    }

    const requestPayload = {
      ...config,
      messages: reversedMessages.reverse()
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

  async chat(options: ChatOptions, org?: Organization): Promise<void> {
    let ts = new Date();
    let auth = this.auth;
    if (!auth) {
      return Promise.reject();
    }
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
    let url = options.config.urlOverwrite || `${this.clientConfig.baseUrl}/api/plugin/llm/v1/completions`;
    headers["Content-Type"] = "application/json";
    headers["x-raccoon-user-id"] = auth.account.userId || "";
    if (org) {
      headers["x-org-code"] = org.code;
      url = options.config.urlOverwrite || `${this.clientConfig.baseUrl}/api/plugin/org/llm/v1/completions`;
    }
    if (!this.clientConfig.key) {
      headers["Authorization"] = `Bearer ${auth.weaverdKey}`;
    } else if (typeof this.clientConfig.key === "string") {
      headers["Authorization"] = `Bearer ${this.clientConfig.key}`;
    } else {
      let aksk = this.clientConfig.key as AccessKey;
      headers["Authorization"] = generateSignature(aksk.accessKeyId, aksk.secretAccessKey, ts);
    }

    let inputLen = options.context.languageId.length + options.context.beforeLines.length + options.context.beforeCursor.length + options.context.afterLines.length + options.context.afterCursor.length;
    if (inputLen > options.maxInputTokens * 3) {
      let shrinkRatio = options.maxInputTokens * 3 / inputLen;
      let beforeLen = Math.floor(options.context.beforeLines.length * shrinkRatio);
      options.context.beforeLines = options.context.beforeLines.slice(-1 * beforeLen);
      let afterLen = Math.floor(options.context.afterLines.length * shrinkRatio);
      options.context.afterLines = options.context.afterLines.slice(0, afterLen);
    } else {
      let len = inputLen;
      let refs: Reference[] = [];
      for (let ref of options.context.reference) {
        let commentPrefix = supportedLanguages[ref.languageId]?.singleLineCommentPrefix;
        if (!commentPrefix) {
          continue;
        }
        let label = `${commentPrefix} ${ref.label};`;
        let snippet = ref.snippet.split("\n").map(((line, _idx, _arr) => {
          return `${commentPrefix} ${line}`;
        })).join("\n");
        let r = { languageId: ref.languageId, label, snippet };
        if ((len + r.label.length + r.languageId.length + r.snippet.length) < options.maxInputTokens * 3) {
          len += r.label.length + r.languageId.length + r.snippet.length;
          refs.push(r);
        } else {
          continue;
        }
      }
      options.context.reference = refs;
    }

    let config: any = {};
    let template = hbs.compile(options.template, { noEscape: true });
    config.prompt = template(options.context);
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

    const controller = new AbortController();
    options.onController?.(controller, options.thisArg);

    try {
      const chatPath = url;
      const chatPayload = {
        method: "POST",
        body: JSON.stringify(config),
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
        this.log?.(JSON.stringify(config, undefined, 2));
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

  async completion(options: CompletionOptions, org?: Organization): Promise<void> {
    let ts = new Date();
    let auth = this.auth;
    if (!auth) {
      return Promise.reject();
    }
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

  public async listKnowledgeBase(org?: Organization, timeoutMs?: number): Promise<KnowledgeBase[]> {
    let auth = this.auth;
    if (!auth) {
      return Promise.reject();
    }
    let listUrl = `${this.clientConfig.baseUrl}/api/plugin${org ? "/org" : ""}/knowledge_base/v1/knowledge_bases`;
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

  public async sendTelemetry(org: Organization | undefined, metricType: MetricType, common: Record<string, any>, metric: Record<string, any> | undefined) {
    let auth = this.auth;
    if (!auth) {
      return Promise.reject();
    }
    let telementryUrl = `${this.clientConfig.baseUrl}/api/plugin${org ? "/org" : ""}/b/v1/m`;
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