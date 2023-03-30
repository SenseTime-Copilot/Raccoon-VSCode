import axios, { ResponseType } from "axios";
import { Uri } from "vscode";
import { Engine } from "../param/configures";
import * as crypto from "crypto";
import { outlog } from "../extension";

export type GetCodeCompletions = {
  completions: Array<string>;
};

export async function getCodeCompletions(
  engine: Engine,
  prompt: string,
  code: string,
  stream: boolean
): Promise<GetCodeCompletions> {
  let api = engine.url;
  if (api.includes("openai")) {
    return getCodeCompletionsOpenAI(engine, prompt, code, stream);
  } else {
    return getCodeCompletionsSenseCode(engine, prompt, code, stream);
  }
}

function getCodeCompletionsOpenAI(engine: Engine, prompt: string, code: string, stream: boolean): Promise<GetCodeCompletions> {
  return new Promise(async (resolve, reject) => {
    let headers = undefined;
    if (engine.key) {
      // eslint-disable-next-line @typescript-eslint/naming-convention
      headers = { 'Authorization': `Bearer ${engine.key}` };
    }
    let payload = {
      prompt: `${prompt} ${code ? `\`\`\`\n${code}\n\`\`\`` : ""}`,
      ...engine.config
    };

    let responseType: ResponseType | undefined = undefined;
    if (stream) {
      payload.max_tokens = 2048;
      payload.stop = undefined;
      payload.n = 1;
      payload.user = "sensecode-vscode-extension";
      payload.stream = true;
      responseType = "stream";
    } else {
      payload.stream = undefined;
    }
    try {
      axios
        .post(engine.url, payload, { headers, proxy: false, timeout: 120000, responseType })
        .then(async (res) => {
          if (res?.status === 200) {
            if (responseType === "stream") {
              resolve(res.data);
              return;
            }
            let codeArray = res?.data.choices;
            const completions = Array<string>();
            const completionsBackup = Array<string>();
            for (let i = 0; i < codeArray.length; i++) {
              const completion = codeArray[i];
              let tmpstr: string = completion.text || "";
              if (tmpstr.trim() === "") {
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
        })
        .catch((err) => {
          reject(err);
        });
    } catch (e) {
      reject(e);
    }
  });
}

function hmacSHA256(key: Buffer, data: Buffer): string {
  const hmac = crypto.createHmac('sha256', key);
  hmac.update(data);
  return hmac.digest('base64');
}

function generateAuthHeader(url: Uri, ak: string, sk: string) {
  let date: string = new Date().toUTCString();
  let message: string = `date: ${date}\nPOST ${url.path} HTTP/1.1`;
  let signature = hmacSHA256(Buffer.from(sk), Buffer.from(message));
  let authorization: string = `hmac accesskey="${ak}", algorithm="hmac-sha256", headers="date request-line", signature="${signature}"`;
  return {
    // eslint-disable-next-line @typescript-eslint/naming-convention
    "Date": date,
    // eslint-disable-next-line @typescript-eslint/naming-convention
    "Authorization": authorization,
    // eslint-disable-next-line @typescript-eslint/naming-convention
    "Content-Type": "application/json"
  };
}

function getCodeCompletionsSenseCode(engine: Engine, prompt: string, code: string, stream: boolean): Promise<GetCodeCompletions> {
  return new Promise(async (resolve, reject) => {
    let headers = undefined;
    if (engine.key) {
      let aksk = engine.key.split(":");
      headers = generateAuthHeader(Uri.parse(engine.url), aksk[0], aksk[1]);
    }
    let payload;
    let p = `${prompt}${code || ""}`;
    if (engine.url.includes("/chat/")) {
      payload = {
        messages: [{ content: p }],
        ...engine.config
      };
    } else {
      payload = {
        prompt: p,
        ...engine.config
      };
    }
    let responseType: ResponseType | undefined = undefined;
    if (stream) {
      payload.max_tokens = 2048;
      payload.stop = undefined;
      payload.n = 1;
      payload.stream = true;
      responseType = "stream";
    }
    try {
      outlog.debug(`POST to [${engine.label}](${engine.url})\n` + JSON.stringify(payload, undefined, 2));
      axios
        .post(engine.url, payload, { headers, proxy: false, timeout: 120000, responseType })
        .then(async (res) => {
          if (res?.status === 200) {
            if (responseType === "stream") {
              resolve(res.data);
              return;
            }
            let codeArray = res?.data.choices;
            const completions = Array<string>();
            const completionsBackup = Array<string>();
            for (let i = 0; i < codeArray.length; i++) {
              const completion = codeArray[i];
              let tmpstr: string = completion.text || completion.message?.content || "";
              if (tmpstr.trim() === "") {
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
        })
        .catch((err) => {
          reject(err);
        });
    } catch (e) {
      reject(e);
    }
  });
}