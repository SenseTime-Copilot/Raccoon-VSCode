import axios, { ResponseType } from "axios";
import { ExtensionContext, Uri } from "vscode";
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
    if (!activeEngine) {
        return Promise.resolve({ completions: [] });
    }
    if (lang === "__Q&A__" && !activeEngine.capacities.includes("chat")) {
        return Promise.reject("Current API not support Q&A.");
    }
    let api = activeEngine.url;
    if (api.includes("tianqi")) {
        return getCodeCompletionsTianqi(activeEngine, lang, prompt);
    } else if (api.includes("sensecore")) {
        return getCodeCompletionsSenseCode(activeEngine, lang, prompt);
    } else {
        return getCodeCompletionsOpenAI(activeEngine, lang, prompt);
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
                            let tmpstr = completion;
                            if (tmpstr.trim() === "")
                                continue;
                            if (completions.includes(completion))
                                continue;
                            completions.push(completion);
                        }
                        resolve({ completions });
                    } else {
                        reject(res.data.message);
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
            headers = { 'Authorization': `Bearer ${engine.key}` };
        }
        let payload = {
            prompt: prompt,
            ...engine.config
        };
        let responseType: ResponseType | undefined = undefined;
        if (lang === "__Q&A__" || Configuration.printOut) {
            payload.max_tokens = 2048;
            payload.stop = undefined;
            payload.n = 1;
            payload.user = "sensecode-vscode-extension"
            payload.stream = true;
            responseType = "stream";
            if (lang === "__Q&A__") {
                payload.prompt = "Use markdown syntax for response content like headings, lists, colored text, code blocks, highlights etc. Make sure not to mention markdown or styling in your actual response. " + payload.prompt;
            }
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
                        const completions_backup = Array<string>();
                        for (let i = 0; i < codeArray.length; i++) {
                            const completion = codeArray[i];
                            let tmpstr = completion.text;
                            if (tmpstr.trim() === "")
                                continue;
                            if (completions.includes(tmpstr))
                                continue;
                            if (completion.finish_reason === "stop") {
                                completions.push(tmpstr + "\n");
                            } else {
                                completions_backup.push(tmpstr);
                            }
                        }
                        resolve({ completions: completions.concat(completions_backup) });
                    } else {
                        reject(res.data.message);
                    }
                })
                .catch((err) => {
                    reject(err.message);
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

function generateAuthHeader(url: Uri, AK: string, SK: string) {
    let date: string = new Date().toUTCString();
    let message: string = `date: ${date}\nPOST ${url.path} HTTP/1.1`;
    let signature = hmacSHA256(Buffer.from(SK), Buffer.from(message));
    let authorization: string = `hmac accesskey="${AK}", algorithm="hmac-sha256", headers="date request-line", signature="${signature}"`;
    return {
        "Date": date,
        "Authorization": authorization,
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
            p = "Use markdown syntax for response content like headings, lists, colored text, code blocks, highlights etc. Make sure not to mention markdown or styling in your actual response. " + prompt;
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
        if (lang === "__Q&A__" || Configuration.printOut) {
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
                        const completions_backup = Array<string>();
                        for (let i = 0; i < codeArray.length; i++) {
                            const completion = codeArray[i];
                            let tmpstr = completion.text || completion.message.content;
                            if (tmpstr.trim() === "")
                                continue;
                            if (completions.includes(tmpstr))
                                continue;
                            if (completion.finish_reason === "stop") {
                                completions.push(tmpstr + "\n");
                            } else {
                                completions_backup.push(tmpstr);
                            }
                        }
                        resolve({ completions: completions.concat(completions_backup) });
                    } else {
                        reject(res.data.message);
                    }
                })
                .catch((err) => {
                    reject(err.message);
                });
        } catch (e) {
            reject(e);
        }
    });
}