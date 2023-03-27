import axios, { ResponseType } from "axios";
import { ExtensionContext, Uri, l10n } from "vscode";
import { Configuration, Engine } from "../param/configures";
import * as crypto from "crypto";

export type GetCodeCompletions = {
  completions: Array<string>;
};

export async function getCodeCompletions(
  context: ExtensionContext,
  prompt: string,
  lang: string
): Promise<GetCodeCompletions> {
  let activeEngine: Engine | undefined = context.globalState.get("engine");
  let capacities: string[] = ["completion"];
  if (!activeEngine) {
    return Promise.reject({ message: l10n.t("Active engine not set") });
  }
  if (activeEngine.capacities) {
    capacities = activeEngine.capacities;
  }
  if ((lang === "__Q&A__" || lang === "__CodeBrush__") && !capacities.includes("chat")) {
    return Promise.reject({ message: l10n.t("Current API not support Q&A") });
  }
  let api = activeEngine.url;
  if (api.includes("tianqi")) {
    return getCodeCompletionsTianqi(activeEngine, lang, prompt);
  } else if (api.includes("openai")) {
    return getCodeCompletionsOpenAI(activeEngine, lang, prompt);
  } else {
    return getCodeCompletionsSenseCode(activeEngine, lang, prompt);
  }
}

function getCodeCompletionsTianqi(engine: Engine, lang: string, prompt: string): Promise<GetCodeCompletions> {
  return new Promise(async (resolve, reject) => {
    let auth;
    if (engine.key) {
      let keySecret = engine.key.split(":");
      auth = {
        apikey: keySecret[0],
        apisecret: keySecret[1]
      };
    }
    let payload = {
      lang: lang,
      prompt: prompt,
      ...auth,
      ...engine.config
    };

    try {
      axios
        .post(engine.url, payload, { proxy: false, timeout: 120000 })
        .then(async (res) => {
          if (res?.data.status === 0) {
            let codeArray = res?.data.result.output.code;
            const completions = Array<string>();
            for (let i = 0; i < codeArray.length; i++) {
              const completion = codeArray[i];
              let tmpstr: string = completion || "";
              if (tmpstr.trim() === "") {
                continue;
              }
              if (completions.includes(completion)) {
                continue;
              }
              completions.push(completion);
            }
            resolve({ completions });
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

function getCodeCompletionsOpenAI(engine: Engine, lang: string, prompt: string): Promise<GetCodeCompletions> {
  return new Promise(async (resolve, reject) => {
    let headers = undefined;
    if (engine.key) {
      // eslint-disable-next-line @typescript-eslint/naming-convention
      headers = { 'Authorization': `Bearer ${engine.key}` };
    }
    let payload = {
      prompt: prompt,
      ...engine.config
    };
    if (lang === "__Q&A__") {

    } else if (lang === "__CodeBrush__") {
      let prefix = l10n.t("If answer contains code snippets, surraound them into markdown code block format. Question:");
      payload.prompt = prefix + payload.prompt;
    } else {
      let prefix = l10n.t("Complete following {0} code:\n", lang);
      payload.prompt = prefix + payload.prompt;
    }
    let responseType: ResponseType | undefined = undefined;
    if (lang === "__Q&A__" || lang === "__CodeBrush__" || Configuration.printOut) {
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

function getCodeCompletionsSenseCode(engine: Engine, lang: string, prompt: string): Promise<GetCodeCompletions> {
  return new Promise(async (resolve, reject) => {
    let headers = undefined;
    if (engine.key) {
      let aksk = engine.key.split(":");
      headers = generateAuthHeader(Uri.parse(engine.url), aksk[0], aksk[1]);
    }
    let payload;
    let p = prompt;
    if (lang === "__Q&A__") {

    } else if (lang === "__CodeBrush__") {
      let prefix = l10n.t("If answer contains code snippets, surraound them into markdown code block format. Question:");
      p = prefix + p;
    } else {
      let prefix = l10n.t("Complete following {0} code:\n", lang);
      p = prefix + p;
    }
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
    if (lang === "__Q&A__" || lang === "__CodeBrush__" || Configuration.printOut) {
      payload.max_tokens = 256;
      payload.stop = undefined;
      payload.n = 1;
      payload.stream = true;
      responseType = "stream";
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