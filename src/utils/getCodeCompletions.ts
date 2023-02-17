import axios from "axios";
import { apiHref, apiKey, apiSecret } from "../localconfig";
import { Configuration } from "../param/configures";

export type GetCodeCompletions = {
    completions: Array<string>;
};

export function getCodeCompletions(
    prompt: string,
    num: Number,
    lang: string
): Promise<GetCodeCompletions> {
    let API_URL = `${apiHref}/multilingual_code_generate_adapt`;
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
                .post(API_URL, payload, { proxy: false, timeout: 120000 })
                .then(async (res) => {
                    if (res?.data.status === 0) {
                        let codeArray = res?.data.result.output.code;
                        const completions = Array<string>();
                        for (let i = 0; i < codeArray.length; i++) {
                            const completion = codeArray[i];
                            let tmpstr = completion;
                            if (tmpstr.trim() === "") continue;
                            if (completions.includes(completion)) continue;
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
