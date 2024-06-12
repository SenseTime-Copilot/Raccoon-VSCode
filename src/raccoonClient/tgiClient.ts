import { CodeClient, AuthInfo, Role, ClientConfig, Choice, ChatOptions, CompletionOptions, AuthMethod, AccountInfo, Organization, KnowledgeBase, MetricType, FinishReason, AccessKeyLoginParam, BrowserLoginParam, PhoneLoginParam, EmailLoginParam, ApiKeyLoginParam, UrlType } from "./CodeClient";
import { EventStreamContentType, fetchEventSource } from "@fortaine/fetch-event-source";
import hbs = require("handlebars");

export class TGIClient implements CodeClient {
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
    return [];
  }

  public url(_type: UrlType): string {
    return this.clientConfig.baseUrl;
  }

  public getAuthUrlLogin(_codeVerifier: string): Promise<string | undefined> {
    return Promise.resolve(`authorization://apikey?${this.clientConfig.key}`);
  }

  public async login(_param?: ApiKeyLoginParam | AccessKeyLoginParam | BrowserLoginParam | PhoneLoginParam | EmailLoginParam): Promise<AuthInfo> {
    let auth: AuthInfo = {
      account: {
        username: this.clientConfig.username || "User",
        userId: undefined,
        pro: true
      },
      weaverdKey: "ANY"
    };
    return auth;
  }

  public async logout(_auth: AuthInfo): Promise<string | undefined> {
    if (this.clientConfig.key) {
      return Promise.reject(new Error("Can not clear Access Key from settings"));
    } else {
      return Promise.resolve(undefined);
    }
  }

  public async syncUserInfo(_auth: AuthInfo): Promise<AccountInfo> {
    return Promise.resolve({
      username: this.clientConfig.username || "User",
      userId: undefined,
      pro: true
    });
  }

  public onDidChangeAuthInfo(_handler?: (token: AuthInfo | undefined) => void): void {
  }

  listKnowledgeBase(_auth: AuthInfo, _org?: Organization, _timeoutMs?: number): Promise<KnowledgeBase[]> {
    return Promise.resolve([]);
  }

  sendTelemetry(_auth: AuthInfo, _org: Organization | undefined, _metricType: MetricType, _common: Record<string, any>, _metric: Record<string, any> | undefined): Promise<void> {
    return Promise.resolve();
  }

  async chat(_auth: AuthInfo, options: ChatOptions, _org?: Organization): Promise<void> {
    let url = options.config.urlOverwrite || `${this.clientConfig.baseUrl}`;
    let headers = options.headers || {};
    headers["Content-Type"] = "application/json";

    let config: any = {};
    if (options.template) {
      let template = hbs.compile(options.template);
      let inputs: Array<{ [key: string]: { content: string } }> = [];
      options.messages.map(
        (v, _idx, _arr) => {
          let item: { [key: string]: { content: string } } = {};
          item[v.role] = { content: v.content };
          inputs.push(item);
        }
      );
      config.inputs = template({ inputs });
    } else {
      config.inputs = options.messages;
    }
    config.stream = !!options.config.stream;
    config.parameters = {
      temperature: options.config.temperature,
      n: options.config.n ?? 1,
      stop: options.config.stop,
      // eslint-disable-next-line @typescript-eslint/naming-convention
      max_new_tokens: options.config.maxNewTokenNum
    };

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

      let log = this.log;

      log?.(chatPath);
      log?.(JSON.stringify(headers, undefined, 2));
      log?.(JSON.stringify(config, undefined, 2));

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
                token: {
                  id: number;
                  text: string;
                  logprob: number;
                  special: boolean;
                };
                generate_text?: string;
                details?: string;
              };
              /* eslint-enable */
              if (json.token.special && json.token.id === 2) {
                options.onUpdate?.(
                  {
                    index: 0,
                    finishReason: FinishReason.stop
                  },
                  options.thisArg
                );
              }
              if (json.token.special) {
                return;
              }
              options.onUpdate?.(
                {
                  index: 0,
                  message: {
                    role: Role.assistant,
                    content: json.token.text || ""
                  }
                },
                options.thisArg
              );
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
          log?.(JSON.stringify(resJson, undefined, 2));
          options.onFinish?.(
            [{
              index: 0,
              message: {
                role: Role.assistant,
                content: resJson.generate_text || ""
              }
            }],
            options.thisArg
          );
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

  async completion(_auth: AuthInfo, options: CompletionOptions, _org?: Organization): Promise<void> {
    let url = options.config.urlOverwrite || `${this.clientConfig.baseUrl}`;
    let headers = options.headers || {};
    headers["Content-Type"] = "application/json";

    let config: any = {};
    let template = hbs.compile(options.template);
    config.inputs = template(options.context);
    config.stream = false;
    config.parameters = {
      temperature: options.config.temperature,
      n: options.config.n ?? 1,
      stop: options.config.stop,
      // eslint-disable-next-line @typescript-eslint/naming-convention
      max_new_tokens: options.config.maxNewTokenNum
    };

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

      let log = this.log;

      log?.(chatPath);
      log?.(JSON.stringify(headers, undefined, 2));
      log?.(JSON.stringify(config, undefined, 2));

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
      log?.(JSON.stringify(resJson, undefined, 2));
      if (!res.ok) {
        const responseTexts = [];

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
        let c: Choice[] = [];
        for (let i = 0; i < resJson.length; i++) {
          c.push({
            index: i,
            message: {
              role: Role.assistant,
              content: resJson[i].generated_text || ""
            }
          });
        }
        options.onFinish?.(c, options.thisArg);
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
}
