import { CodeClient, AuthInfo, Role, ClientConfig, Choice, ChatOptions, CompletionOptions, AuthMethod, AccountInfo, Organization, KnowledgeBase, MetricType, FinishReason, BrowserLoginParam, PhoneLoginParam, EmailLoginParam, ApiKeyLoginParam, UrlType, Capability, OrganizationSettings, ErrorInfo, WeChatLoginParam } from "./CodeClient";
import { EventStreamContentType, fetchEventSource } from "@fortaine/fetch-event-source";

export class TGIClient implements CodeClient {
  private log?: (message: string, ...args: any[]) => void;
  private auth?: AuthInfo;

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

  capabilities(): Promise<Capability[]> {
    return Promise.resolve([]);
  }

  public getAuthUrl(_param: BrowserLoginParam | WeChatLoginParam): string {
    return "";
  }

  public async login(_param?: ApiKeyLoginParam | BrowserLoginParam | WeChatLoginParam | PhoneLoginParam | EmailLoginParam): Promise<AuthInfo> {
    let auth: AuthInfo = {
      account: {
        username: "User",
        userId: undefined,
        pro: true
      },
      weaverdKey: "ANY"
    };
    this.auth = auth;
    return auth;
  }

  public restoreAuthInfo(_auth: AuthInfo): "SET" | "RESET" | "UPDATE" {
    return "UPDATE";
  }

  public getAuthInfo(): AuthInfo | undefined {
    return this.auth;
  }

  public async logout(): Promise<string | undefined> {
    if (this.clientConfig.key) {
      return Promise.reject(new Error("Can not clear Access Key from settings"));
    } else {
      return Promise.resolve(undefined);
    }
  }

  public async getOrgSettings(_org: Organization): Promise<OrganizationSettings> {
    return Promise.reject();
  }

  public async getFile(_org: Organization, _fileName: string): Promise<Buffer> {
    return Promise.reject();
  }

  public async syncUserInfo(): Promise<AccountInfo> {
    return Promise.resolve({
      username: "User",
      userId: undefined,
      pro: true
    });
  }

  public onDidChangeAuthInfo(_handler?: (token: AuthInfo | undefined) => void): void {
  }

  listKnowledgeBase(_org?: Organization, _timeoutMs?: number): Promise<KnowledgeBase[]> {
    return Promise.resolve([]);
  }

  sendTelemetry(_org: Organization | undefined, _metricType: MetricType, _common: Record<string, any>, _metric: Record<string, any> | undefined): Promise<void> {
    return Promise.resolve();
  }

  async chat(options: ChatOptions, _org?: Organization): Promise<void> {
    let url = options.config.urlOverwrite || `${this.clientConfig.baseUrl}`;
    let headers = options.headers || {};
    headers["Content-Type"] = "application/json";

    let config: any = {};
    config.inputs = options.messages;
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

              let error: ErrorInfo = {
                code: res.status,
                detail: responseTexts.join("\n\n")
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
            let error: ErrorInfo = {
              code: e.cause.errno,
              detail: e.cause.message
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

          let error: ErrorInfo = {
            code: res.status,
            detail: responseTexts.join("\n\n")
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
      let error: ErrorInfo = {
        code: 0,
        detail: (e as Error).message
      };
      this.log?.(JSON.stringify(error, undefined, 2));
      options.onError?.(error, options.thisArg);
    }
  }

  async completion(options: CompletionOptions, _org?: Organization): Promise<void> {
    let url = options.config.urlOverwrite || `${this.clientConfig.baseUrl}`;
    let headers = options.headers || {};
    headers["Content-Type"] = "application/json";

    let config: any = {};
    config.inputs = options.context;
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

        let error: ErrorInfo = {
          code: res.status,
          detail: responseTexts.join("\n\n")
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
      let error: ErrorInfo = {
        code: 0,
        detail: (e as Error).message
      };
      this.log?.(JSON.stringify(error, undefined, 2));
      options.onError?.(error, options.thisArg);
    }
  }
}
