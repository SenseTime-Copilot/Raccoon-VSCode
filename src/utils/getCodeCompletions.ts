import axios, { ResponseType } from "axios";
import { Uri } from "vscode";
import { Engine } from "../param/configures";
import * as crypto from "crypto";
import { configuration, outlog } from "../extension";
import { IncomingMessage } from "http";
import * as zlib from "zlib";

export type GetCodeCompletions = {
  completions: Array<string>;
};

export async function getCodeCompletions(
  engine: Engine,
  prompt: string,
  n: number,
  stream: boolean,
  cancel: AbortSignal
): Promise<GetCodeCompletions | IncomingMessage> {
  let key = engine.key;
  try {
    if (!key) {
      key = await configuration.getApiKeyRaw(engine.label);
    }
  } catch (e) {
    return Promise.reject(e);
  }
  return getCodeCompletionsSenseCode(engine, key, n, prompt, stream, cancel);
}

function hmacSHA256(key: Buffer, data: Buffer): string {
  const hmac = crypto.createHmac('sha256', key);
  hmac.update(data);
  return hmac.digest('base64');
}

function generateSignature(url: Uri, date: string, ak: string, sk: string) {
  let message: string = `date: ${date}\nPOST ${url.path} HTTP/1.1`;
  let signature = hmacSHA256(Buffer.from(sk), Buffer.from(message));
  let authorization: string = `hmac accesskey="${ak}", algorithm="hmac-sha256", headers="date request-line", signature="${signature}"`;
  return authorization;
}

function getCodeCompletionsSenseCode(engine: Engine, key: string | undefined, n: number, prompt: string, stream: boolean, signal: AbortSignal): Promise<GetCodeCompletions | IncomingMessage> {
  return new Promise(async (resolve, reject) => {
    let date: string = new Date().toUTCString();
    let auth = '';
    if (key) {
      if (key.includes("#")) {
        let aksk = key.split("#");
        auth = generateSignature(Uri.parse(engine.url), date, aksk[0], aksk[1]);
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

    let payload;
    let p = prompt;
    let responseType: ResponseType | undefined = undefined;
    let config = { ...engine.config };
    config.n = n;
    if (stream) {
      config.stop = undefined;
      config.stream = true;
      responseType = "stream";
    } else {
      config.stream = false;
    }
    if (engine.url.includes("/chat/")) {
      payload = {
        messages: [{ content: p }],
        ...config
      };
    } else {
      payload = {
        prompt: p,
        ...config
      };
    }
    outlog.debug(`POST to [${engine.label}](${engine.url})\n` + JSON.stringify(payload, undefined, 2));
    try {
      axios
        .post(engine.url, payload, { headers, proxy: false, timeout: 120000, responseType, signal })
        .then(async (res) => {
          if (res?.status === 200) {
            if (responseType === "stream") {
              resolve(res.data);
              return;
            }
            let codeArray = res?.data?.choices;
            if (!codeArray) {
              resolve(res.data);
              return;
            }
            const completions = Array<string>();
            const completionsBackup = Array<string>();
            for (let i = 0; i < codeArray.length; i++) {
              const completion = codeArray[i];
              let tmpstr: string = completion.text || completion.message?.content || "";
              if (!tmpstr.trim()) {
                continue;
              }
              if (completions.includes(tmpstr)) {
                continue;
              }
              if (completion.finish_reason === "stop") {
                completions.push(tmpstr + "\n");
              } else {
                completionsBackup.push(tmpstr);
              }
            }
            resolve({ completions: completions.concat(completionsBackup) });
          } else {
            reject(res.data);
          }
        }, (err) => {
          configuration.refreshToken(engine);
          reject(err);
        }).catch(e => {
          reject(e);
        });
    } catch (e) {
      reject(e);
    }
  });
}

export async function sendTelemetryLog(_eventName: string, info: Record<string, any>) {
  const engine: Engine = configuration.getActiveEngineInfo();
  let key = engine.key;
  try {
    if (!key) {
      key = await configuration.getApiKeyRaw(engine.label);
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
      auth = generateSignature(Uri.parse(engine.url), date, aksk[0], aksk[1]);
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
  let user = await configuration.username(engine.label);

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
