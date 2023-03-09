import axios from "axios";
import { ExtensionContext } from "vscode";
import { Engine } from "../param/configures";

export type GetCodeCompletions = {
    completions: Array<string>;
};

export function getCodeCompletions(
    context: ExtensionContext,
    prompt: string,
    lang: string
): Promise<GetCodeCompletions> {
    let activeEngine: Engine | undefined = context.globalState.get("engine");
    if (!activeEngine) {
        return Promise.resolve({ completions: [] });
    }
    let api = activeEngine.url;
    if (api.includes("tianqi")) {
        return getCodeCompletionsTianqi(activeEngine, lang, prompt);
    } else {
        return getCodeCompletionsOpenAI(activeEngine, lang, prompt);
    }
}

function getCodeCompletionsTianqi(engine: Engine, lang: string, prompt: string): Promise<GetCodeCompletions> {
    return new Promise(async (resolve, reject) => {
        let payload = {
            lang: lang,
            prompt: prompt,
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
        let payload = {
            prompt: prompt,
            ...engine.config
        };

        try {
            let headers = undefined;
            if (engine.key) {
                headers = { 'Authorization': `Bearer ${engine.key}` };
            }
            axios
                .post(engine.url, payload, { headers, proxy: false, timeout: 120000 })
                .then(async (res) => {
                    if (res?.status === 200) {
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
                    reject(err);
                });
        } catch (e) {
            reject(e);
        }
    });
}