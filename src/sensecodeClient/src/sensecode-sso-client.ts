import axios, { ResponseType } from "axios";
import jwt_decode from "jwt-decode";
import * as crypto from "crypto";
import { IncomingMessage } from "http";
import * as zlib from "zlib";
import { CodeClient, AuthInfo, Prompt } from "./CodeClient";

export interface SsoClientConfig {
  label: string;
  url: string;
  config: any;
  // eslint-disable-next-line @typescript-eslint/naming-convention
  token_limit: number;
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
    aksk: tokenKey[1]
  };
}

function hmacSHA256(key: Buffer, data: Buffer): string {
  const hmac = crypto.createHmac('sha256', key);
  hmac.update(data);
  return hmac.digest('base64');
}

function generateSignature(urlString: string, date: string, ak: string, sk: string) {
  let url = new URL(urlString);
  let message: string = `date: ${date}\nPOST ${url.pathname} HTTP/1.1`;
  let signature = hmacSHA256(Buffer.from(sk), Buffer.from(message));
  let authorization: string = `hmac accesskey="${ak}", algorithm="hmac-sha256", headers="date request-line", signature="${signature}"`;
  return authorization;
}

export class SsoSenseCodeClient implements CodeClient {
  private _username?: string;
  private _avatar?: string;
  private _weaverdKey?: string;

  constructor(private readonly clientConfig: SsoClientConfig, private debug?: (message: string, ...args: any[]) => void) {
  }

  public logout(): Promise<void> {
    this._username = undefined;
    this._avatar = undefined;
    this._weaverdKey = undefined;
    return Promise.resolve();
  }

  public restoreAuth(auth: AuthInfo): Promise<void> {
    this._username = auth.username;
    this._avatar = auth.avatar;
    this._weaverdKey = auth.weaverdKey;
    return Promise.resolve();
  }

  public get state(): string {
    return crypto.createHash('sha256').update(this._weaverdKey || "").digest("base64");
  }

  public get label(): string {
    return this.clientConfig.label;
  }

  public get tokenLimit(): number {
    return this.clientConfig.token_limit;
  }

  public get username(): string | undefined {
    return this._username;
  }

  private async getUserAvatar(): Promise<string | undefined> {
    let token = this._weaverdKey;
    if (!token) {
      return Promise.resolve(undefined);
    }
    let info = unweaveKey(token);
    if (!info || !info.name) {
      return Promise.resolve(undefined);

    }
    return axios.get(`https://gitlab.bj.sensetime.com/api/v4/users?username=${info.name}`,
      {
        // eslint-disable-next-line @typescript-eslint/naming-convention
        headers: { "PRIVATE-TOKEN": info?.token || "" }
      })
      .then(
        (res1) => {
          if (res1?.status === 200) {
            if (res1.data[0]) {
              // eslint-disable-next-line @typescript-eslint/naming-convention
              this._avatar = res1.data[0].avatar_url;
              return this._avatar;
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

  public get avatar(): string | undefined {
    return this._avatar;
  }

  private async apiKeyRaw(): Promise<string> {
    if (!this._weaverdKey) {
      return Promise.reject();
    }
    const cfg = this.clientConfig;
    let info = unweaveKey(this._weaverdKey);
    if (cfg && info.id !== 0) {
      return axios.get(`https://gitlab.bj.sensetime.com/api/v4/user`,
        {
          // eslint-disable-next-line @typescript-eslint/naming-convention
          headers: { "PRIVATE-TOKEN": info.token || "" }
        })
        .then(
          async (res) => {
            if (res?.data?.name === "kestrel.guest" && info.aksk) {
              return Buffer.from(info.aksk, "base64").toString().trim();
            } else {
              return Promise.reject();
            }
          }
        );
    } else if (info.aksk) {
      return Promise.resolve(Buffer.from(info.aksk, "base64").toString().trim());
    } else {
      return Promise.reject();
    }
  }

  public getAuthUrlLogin(codeVerifier: string): Promise<string> {
    let url = "https://sso.sensetime.com/enduser/sp/sso/sensetimeplugin_jwt102?enterpriseId=sensetime";
    return Promise.resolve(url);
  }

  private async tokenWeaver(name: string, token: string): Promise<AuthInfo> {
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
    this._weaverdKey = key;
    this._username = name;
    this._avatar = await this.getUserAvatar();
    return {
      id_token: "",
      username: name,
      weaverdKey: key,
      avatar: this._avatar
    };
  }

  public async login(callbackUrl: string, codeVerifer: string): Promise<AuthInfo> {
    let url = new URL(callbackUrl);
    let query = url.search?.slice(1);
    if (!query) {
      return Promise.reject();
    }

    let decoded: any = jwt_decode(query);
    let username = decoded.id_token?.username || decoded.username;
    let token = ["O", "T", "V", "G", "N", "k", "V", "D", "O", "U", "Y", "0", "O", "E", "N", "D", "M", "D", "k", "4", "N", "E", "Y", "1", "N", "j", "J", "E", "Q", "U", "Y", "5", "R", "T", "U", "x", "M", "j", "A", "w", "N", "D", "E", "j", "N", "T", "c", "x", "N", "j", "B", "D", "R", "T", "A", "2", "M", "E", "I", "y", "N", "j", "Y", "5", "N", "E", "Q", "1", "N", "U", "R", "C", "N", "T", "I", "z", "M", "T", "A", "y", "M", "z", "c", "y", "M", "E", "U"];
    return this.tokenWeaver(username, token.join(''));
  }

  public async refreshToken(): Promise<AuthInfo> {
    return Promise.reject();
  }

  private _postPrompt(prompt: Prompt, n: number, maxToken: number, stopWord: string | undefined, stream: boolean, signal: AbortSignal): Promise<any | IncomingMessage> {
    return new Promise(async (resolve, reject) => {
      let key = await this.apiKeyRaw();
      let date: string = new Date().toUTCString();
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

      let p = prompt;
      let responseType: ResponseType | undefined = undefined;
      let config = { ...this.clientConfig.config };
      config.n = n;
      config.stream = stream;
      config.stop = stopWord;
      config.max_tokens = maxToken;
      if (stream) {
        responseType = "stream";
      }
      let payload = {
        prompt: `${p.prologue}\n${p.prompt}\n${p.suffix}`,
        ...config
      };

      if (this.debug) {
        this.debug(`Request to: ${this.clientConfig.url}`);
        let pc = { ...payload };
        let content = pc.prompt;
        pc.prompt = undefined;
        this.debug(`Parameters: ${JSON.stringify(pc)}`);
        this.debug(`Prompt:\n${content}`);
      }

      axios
        .post(this.clientConfig.url, payload, { headers, proxy: false, timeout: 120000, responseType, signal })
        .then(async (res) => {
          if (res?.status === 200) {
            if (this.debug && !stream) {
              this.debug(JSON.stringify(res.data));
            }
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

  public getCompletions(prompt: Prompt, n: number, maxToken: number, stopWord: string | undefined, signal: AbortSignal): Promise<any> {
    return this._postPrompt(prompt, n, maxToken, stopWord, false, signal);
  }

  public async getCompletionsStreaming(prompt: Prompt, n: number, maxToken: number, stopWord: string | undefined, signal: AbortSignal): Promise<IncomingMessage> {
    return this._postPrompt(prompt, n, maxToken, stopWord, true, signal).then((data) => {
      if (data instanceof IncomingMessage) {
        return data;
      } else {
        return Promise.reject(Error("Unexpected response format"));
      }
    });
  }

  private getBaseUrl() {
    let baseUrl = 'https://signin.sensecore.cn';
    if (this.clientConfig.url.startsWith("https://ams.sensecoreapi.cn")) {
      baseUrl = 'https://signin.sensecore.cn';
    } else if (this.clientConfig.url.startsWith("https://ams.sensecoreapi.tech")) {
      baseUrl = 'https://signin.sensecore.tech';
    } else if (this.clientConfig.url.startsWith("https://ams.sensecoreapi.dev")) {
      baseUrl = 'https://signin.sensecore.dev';
    }
    return baseUrl;
  }

  public async sendTelemetryLog(_eventName: string, info: Record<string, any>) {
    try {
      const cfg: SsoClientConfig = this.clientConfig;
      let key = await this.apiKeyRaw();
      if (!key) {
        return Promise.reject();
      }

      let apiUrl = this.getBaseUrl() + "/studio/ams/data/logs";
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
          timeout: 120000,
          transformRequest: [
            (data, header) => {
              if (!header) {
                return;
              }
              header['Content-Encoding'] = 'gzip';
              const w = zlib.createGzip();
              w.end(Buffer.from(data));
              return w;
            }
          ]
        }
      ).then(async (res) => {
        if (res?.status === 200) {
          return;
        } else {
          throw Error();
        }
      });
    } catch (e) {
      return Promise.reject();
    }
  }
}