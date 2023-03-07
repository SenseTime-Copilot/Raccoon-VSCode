import axios from "axios";
import { apiKey, apiSecret } from "../localconfig";
import { Uri } from "vscode";
import { Configuration } from "../param/configures";

export type GetCodeCompletions = {
    completions: Array<string>;
};

export function getCodeCompletions(
    prompt: string,
    num: Number,
    lang: string
): Promise<GetCodeCompletions> {
    let api = Configuration.engineAPI;
    if (api.authority.includes("tianqi")) {
        return getCodeCompletionsTianqi(api, lang, prompt, num);
    } else if (api.authority.includes("sensecore")) {
        api = Uri.parse("http://10.8.33.51:15000/v1");
        return getCodeCompletionsSensecore(api, lang, prompt, num);
    } else {
        throw Error();
    }
}

function getCodeCompletionsTianqi(api: Uri, lang: string, prompt: string, num: Number): Promise<GetCodeCompletions> {
    let API_URL = Uri.joinPath(api, "multilingual_code_generate_adapt");
    return new Promise(async (resolve, reject) => {
        let payload = {
            lang: lang,
            prompt: prompt,
            n: num,
            apikey: apiKey,
            apisecret: apiSecret,
            temperature: Configuration.temp,
            top_p: Configuration.topp,
            top_k: Configuration.topk,
        };

        try {
            axios
                .post(API_URL.toString(), payload, { proxy: false, timeout: 120000 })
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

function getCodeCompletionsSensecore(api: Uri, lang: string, prompt: string, num: Number): Promise<GetCodeCompletions> {
    let API_URL = Uri.joinPath(api, "completions");
    return new Promise(async (resolve, reject) => {
        let payload = {
            prompt: prompt,
            n: num,
            max_tokens: 32,
            temperature: Configuration.temp,
            top_p: Configuration.topp,
        };

        try {
            axios
                .post(API_URL.toString(), payload, { proxy: false, timeout: 120000 })
                .then(async (res) => {
                    if (res?.status === 200) {
                        let codeArray = res?.data.choices;
                        const completions = Array<string>();
                        for (let i = 0; i < codeArray.length; i++) {
                            const completion = codeArray[i];
                            let tmpstr = completion.text;
                            if (tmpstr.trim() === "")
                                continue;
                            if (completions.includes(tmpstr))
                                continue;
                            completions.push(tmpstr);
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