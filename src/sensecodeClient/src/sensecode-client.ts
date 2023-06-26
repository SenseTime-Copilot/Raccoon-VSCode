import axios, { ResponseType } from "axios";
import FormData = require("form-data");
import jwt_decode from "jwt-decode";
import * as crypto from "crypto";
import { IncomingMessage } from "http";
import * as zlib from "zlib";
import { CodeClient, AuthInfo, Prompt } from "./CodeClient";

export interface ClientMeta {
  clientId: string;
  redirectUrl: string;
}

export interface ClientConfig {
  label: string;
  url: string;
  config: any;
  // eslint-disable-next-line @typescript-eslint/naming-convention
  token_limit: number;
  key?: string;
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

export class SenseCodeClient implements CodeClient {
  private _id_token?: string;
  private _username?: string;
  private _avatar?: string;
  private _weaverdKey?: string;
  private _refreshToken?: string;

  constructor(private readonly meta: ClientMeta, private readonly clientConfig: ClientConfig, private debug?: (message: string, ...args: any[]) => void) {
  }

  public async logout(): Promise<void> {
    return axios.get(`${this.getAuthBaseUrl()}/oauth2/sessions/logout?id_token_hint=${encodeURIComponent(this._id_token || '')}&redirect_uri=${encodeURIComponent(this.meta.redirectUrl)}`)
      .then((v) => {
        this._id_token = undefined;
        this._username = undefined;
        this._avatar = undefined;
        this._weaverdKey = undefined;
        this._refreshToken = undefined;
      });
  }

  public restoreAuth(auth: AuthInfo): Promise<void> {
    this._id_token = auth.id_token;
    this._username = auth.username;
    this._avatar = auth.avatar;
    this._weaverdKey = auth.weaverdKey;
    this._refreshToken = auth.refreshToken;
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
    return Promise.resolve(undefined);
  }

  public get avatar(): string | undefined {
    return this._avatar;
  }

  private async apiKeyRaw(): Promise<string> {
    if (this.clientConfig.key) {
      return Promise.resolve(this.clientConfig.key);
    }
    if (!this._weaverdKey) {
      return Promise.reject();
    }
    let info = unweaveKey(this._weaverdKey);
    if (info.aksk) {
      return Promise.resolve(Buffer.from(info.aksk, "base64").toString().trim());
    } else {
      return Promise.reject();
    }
  }

  public getAuthUrlLogin(codeVerifier: string): Promise<string> {
    if (this.clientConfig.key) {
      return Promise.reject();
    }

    let baseUrl = this.getAuthBaseUrl();
    let challenge = crypto.createHash('sha256').update(codeVerifier).digest("base64url");
    let url = `${baseUrl}/oauth2/auth?response_type=code&client_id=${this.meta.clientId}&code_challenge_method=S256&code_challenge=${challenge}&redirect_uri=${this.meta.redirectUrl}&state=${baseUrl}&scope=openid%20offline%20offline_access`;
    return Promise.resolve(url);
  }

  private getAuthBaseUrl() {
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

  private async tokenWeaver(data: any): Promise<AuthInfo> {
    let decoded: any = jwt_decode(data.id_token);
    let name = decoded.id_token?.username;
    let token = Buffer.from(data.access_token).toString('base64');
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
    this._id_token = data.id_token;
    this._weaverdKey = key;
    this._username = name;
    this._avatar = await this.getUserAvatar();
    this._refreshToken = data.refresh_token;
    return {
      id_token: data.id_token,
      username: name,
      weaverdKey: key,
      avatar: this._avatar,
      refreshToken: data.refresh_token
    };
  }

  private async loginSenseCore(code: string, codeVerifier: string, authUrl: string): Promise<AuthInfo> {
    var data = new FormData();
    data.append('client_id', this.meta.clientId);
    data.append('redirect_uri', this.meta.redirectUrl);
    data.append('grant_type', 'authorization_code');
    data.append('code_verifier', codeVerifier);
    data.append('code', code);
    data.append('state', authUrl);

    return axios.post(`${authUrl}/oauth2/token`,
      data.getBuffer(),
      {
        headers: data.getHeaders()
      })
      .then((resp) => {
        if (resp && resp.status === 200) {
          return this.tokenWeaver(resp.data);
        } else {
          return Promise.reject();
        }
      }).catch((e) => {
        return Promise.reject(e);
      });
  }

  public async login(callbackUrl: string, codeVerifer: string): Promise<AuthInfo> {
    let url = new URL(callbackUrl);
    let query = url.search?.slice(1);
    if (!query) {
      return Promise.reject();
    }
    try {
      let data = JSON.parse('{"' + decodeURIComponent(query).replace(/"/g, '\\"').replace(/&/g, '","').replace(/=/g, '":"') + '"}');
      return this.loginSenseCore(data.code, codeVerifer, data.state);
    } catch (e) {
      return Promise.reject(e);
    }
  }

  public async refreshToken(): Promise<AuthInfo> {
    let refreshToken = this._refreshToken;
    if (refreshToken) {
      let baseUrl = 'https://signin.sensecore.cn';
      if (this.clientConfig.url.startsWith("https://ams.sensecoreapi.cn")) {
        baseUrl = 'https://signin.sensecore.cn';
      } else if (this.clientConfig.url.startsWith("https://ams.sensecoreapi.tech")) {
        baseUrl = 'https://signin.sensecore.tech';
      } else if (this.clientConfig.url.startsWith("https://ams.sensecoreapi.dev")) {
        baseUrl = 'https://signin.sensecore.dev';
      }
      let url = `${baseUrl}/oauth2/token`;
      let date: string = new Date().toUTCString();
      let headers = {
        // eslint-disable-next-line @typescript-eslint/naming-convention
        "Date": date,
        // eslint-disable-next-line @typescript-eslint/naming-convention
        "Content-Type": "application/x-www-form-urlencoded"
      };
      return axios.post(url,
        `grant_type=refresh_token&client_id=${this.meta.clientId}&refresh_token=${refreshToken}&redirect_uri=${this.meta.redirectUrl}`,
        { headers })
        .then((resp) => {
          if (resp && resp.status === 200) {
            return this.tokenWeaver(resp.data);
          }
          return Promise.reject();
        }, (err) => {
          throw err;
        });
    }
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

  public async sendTelemetryLog(_eventName: string, info: Record<string, any>) {
    try {
      const cfg: ClientConfig = this.clientConfig;
      let key = await this.apiKeyRaw();
      if (!key) {
        return Promise.reject();
      }

      let uri = new URL(this.clientConfig.url);
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
      }, (err) => {
        throw err;
      });
    } catch (e) {
      return Promise.reject();
    }
  }
}