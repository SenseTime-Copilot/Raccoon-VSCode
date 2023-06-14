import axios, { ResponseType } from "axios";
import FormData = require("form-data");
import jwt_decode from "jwt-decode";
import * as crypto from "crypto";
import { IncomingMessage } from "http";
import * as zlib from "zlib";

export interface AuthInfo {
  username: string;
  weaverdKey: string;
  avatar?: string;
  refreshToken?: string;
}

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
  rawKey?: string;
  sensetimeOnly?: boolean;
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

export class SenseCoderClient {
  private _username?: string;
  private _avatar?: string;
  private _weaverdKey?: string;
  private _refreshToken?: string;

  constructor(private readonly meta: ClientMeta, private readonly clientConfig: ClientConfig) {
  }

  public logout() {
    this._username = undefined;
    this._avatar = undefined;
    this._weaverdKey = undefined;
    this._refreshToken = undefined;
  }

  public restoreAuth(auth: AuthInfo) {
    this._username = auth.username;
    this._avatar = auth.avatar;
    this._weaverdKey = auth.weaverdKey;
    this._refreshToken = auth.refreshToken;
  }

  public state() {
    return crypto.createHash('sha256').update(this._weaverdKey || "").digest("base64");
  }

  public get label(): string {
    return this.clientConfig.label;
  }

  public get tokenLimit(): number {
    return this.clientConfig.token_limit;
  }

  public username(): string | undefined {
    return this._username;
  }

  private async getUserAvatar(): Promise<string | undefined> {
    let token = this._weaverdKey;
    if (!token) {
      return;
    }
    let info = unweaveKey(token);
    if (!this.clientConfig.sensetimeOnly || !info.name) {
      return;
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
              return res1.data[0].avatar_url;
            }
          }
        }
      ).catch(async (_error) => {
        return "";
      });
  }

  public async avatar(): Promise<string | undefined> {
    if (!this._avatar) {
      this._avatar = await this.getUserAvatar();
    }
    return this._avatar;
  }

  public async getApiKeyRaw(): Promise<string | undefined> {
    if (this.clientConfig.rawKey) {
      return this.clientConfig.rawKey;
    }
    if (!this._weaverdKey) {
      return;
    }
    const cfg = this.clientConfig;
    let info = unweaveKey(this._weaverdKey);
    if (cfg && cfg.sensetimeOnly && info.id !== 0) {
      return axios.get(`https://gitlab.bj.sensetime.com/api/v4/user`,
        {
          // eslint-disable-next-line @typescript-eslint/naming-convention
          headers: { "PRIVATE-TOKEN": info?.token || "" }
        })
        .then(
          async (res) => {
            if (res?.data?.name === "kestrel.guest" && info?.aksk) {
              return Buffer.from(info?.aksk, "base64").toString().trim();
            }
            return undefined;
          }
        ).catch(async (_error) => {
          return undefined;
        });
    }
    return Buffer.from(info?.aksk, "base64").toString().trim();
  }

  public getAuthUrlLogin(codeVerifier: string): string | undefined {
    if (this.clientConfig.rawKey) {
      return;
    }
    if (!this.clientConfig.sensetimeOnly) {
      let baseUrl = 'https://signin.sensecore.cn';
      if (this.clientConfig.url.startsWith("https://ams.sensecoreapi.cn")) {
        baseUrl = 'https://signin.sensecore.cn';
      } else if (this.clientConfig.url.startsWith("https://ams.sensecoreapi.tech")) {
        baseUrl = 'https://signin.sensecore.tech';
      } else if (this.clientConfig.url.startsWith("https://ams.sensecoreapi.dev")) {
        baseUrl = 'https://signin.sensecore.dev';
      }
      let challenge = crypto.createHash('sha256').update(codeVerifier).digest("base64url");
      let url = `${baseUrl}/oauth2/auth?response_type=code&client_id=${this.meta.clientId}&code_challenge_method=S256&code_challenge=${challenge}&redirect_uri=${this.meta.redirectUrl}&state=${baseUrl}&scope=openid%20offline%20offline_access`;
      return url;
    } else {
      let url = "https://sso.sensetime.com/enduser/sp/sso/sensetimeplugin_jwt102?enterpriseId=sensetime";
      return url;
    }
  }

  private async tokenWeaver(name: string, token: string, refreshToken?: string): Promise<AuthInfo> {
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
    this._refreshToken = refreshToken;
    return {
      username: name,
      weaverdKey: key,
      avatar: await this.getUserAvatar(),
      refreshToken: refreshToken
    };
  }

  private async loginSenseCore(code: string, codeVerifier: string, authUrl: string): Promise<AuthInfo | undefined> {
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
          let decoded: any = jwt_decode(resp.data.id_token);
          let username = decoded.id_token?.username;
          let token = Buffer.from(resp.data.access_token).toString('base64');
          return this.tokenWeaver(username, token, resp.data.refresh_token);
        }
      });
  }

  public async getTokenFromLoginResult(callbackUrl: string, codeVerifer: string): Promise<AuthInfo | undefined> {
    let url = new URL(callbackUrl);
    let query = url.search?.slice(1);
    if (!query) {
      return;
    }
    if (url.pathname === "/login") {
      try {
        let data = JSON.parse('{"' + decodeURIComponent(query).replace(/"/g, '\\"').replace(/&/g, '","').replace(/=/g, '":"') + '"}');
        return this.loginSenseCore(data.code, codeVerifer, data.state);
      } catch (e) {
        return Promise.reject(e);
      }
    } else {
      let decoded: any = jwt_decode(query);
      let username = decoded.id_token?.username || decoded.username;
      let token = ["O", "T", "V", "G", "N", "k", "V", "D", "O", "U", "Y", "0", "O", "E", "N", "D", "M", "D", "k", "4", "N", "E", "Y", "1", "N", "j", "J", "E", "Q", "U", "Y", "5", "R", "T", "U", "x", "M", "j", "A", "w", "N", "D", "E", "j", "N", "T", "c", "x", "N", "j", "B", "D", "R", "T", "A", "2", "M", "E", "I", "y", "N", "j", "Y", "5", "N", "E", "Q", "1", "N", "U", "R", "C", "N", "T", "I", "z", "M", "T", "A", "y", "M", "z", "c", "y", "M", "E", "U"];
      return this.tokenWeaver(username, token.join(''));
    }
  }

  public async refreshToken(): Promise<AuthInfo | undefined> {
    let refreshToken = this._refreshToken;
    if (refreshToken) {
      if (!this.clientConfig.sensetimeOnly) {
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
          `grant_type=refresh_token&client_id=${this.meta.clientId}&refresh_token=${refreshToken}`,
          { headers })
          .then((resp) => {
            if (resp && resp.status === 200) {
              let decoded: any = jwt_decode(resp.data.id_token);
              let username = decoded.id_token?.username;
              let token = Buffer.from(resp.data.access_token).toString('base64');
              this._username = username;
              return this.tokenWeaver(username, token, resp.data.refresh_token);
            }
          });
      }
    }
  }

  private _postPrompt(prompt: string, n: number, maxToken: number, stopWord: string | undefined, stream: boolean, signal: AbortSignal): Promise<any | IncomingMessage> {
    return new Promise(async (resolve, reject) => {
      let key = await this.getApiKeyRaw();
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
        prompt: p,
        ...config
      };

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

  public getCompletions(prompt: string, n: number, maxToken: number, stopWord: string | undefined, signal: AbortSignal): Promise<any> {
    return this._postPrompt(prompt, n, maxToken, stopWord, false, signal);
  }

  public async getCompletionsStreaming(prompt: string, n: number, maxToken: number, stopWord: string | undefined, signal: AbortSignal): Promise<IncomingMessage> {
    return this._postPrompt(prompt, n, maxToken, stopWord, true, signal).then((data) => {
      if (data instanceof IncomingMessage) {
        return data;
      } else {
        return Promise.reject(Error("Unexpected response format"));
      }
    });
  }

  public async sendTelemetryLog(_eventName: string, info: Record<string, any>) {
    const cfg: ClientConfig = this.clientConfig;
    let key = cfg.rawKey;
    try {
      if (!key) {
        key = await this.getApiKeyRaw();
      }
      if (!key) {
        return;
      }
    } catch (e) {
      return;
    }

    let apiUrl = "https://ams.sensecoreapi.cn/studio/ams/data/logs";
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
    let user = this.username();

    axios.post(
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
      if (res?.status === 200) { }
    });
  }
}