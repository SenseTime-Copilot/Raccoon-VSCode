import axios, { ResponseType } from "axios";
import { Engine } from "../param/configures";
import { outlog } from "../extension";
import { IncomingMessage } from "http";
import { GetCodeCompletions } from "./getCodeCompletions";

export function getCodeCompletionsOpenAI(engine: Engine, prompt: string, stream: boolean): Promise<GetCodeCompletions | IncomingMessage> {
  return new Promise(async (resolve, reject) => {
    let headers = undefined;
    if (engine.key) {
      // eslint-disable-next-line @typescript-eslint/naming-convention
      headers = { 'Authorization': `Bearer ${engine.key}` };
    }
    let responseType: ResponseType | undefined = undefined;
    let config = { ...engine.config };
    if (stream) {
      if (engine.streamConfig) {
        config = engine.streamConfig;
      } else {
        config.max_tokens = 2048;
        config.stop = undefined;
        config.n = 1;
      }
      config.user = "sensecode-vscode-extension";
      config.stream = true;
      responseType = "stream";
    }
    let payload = {
      prompt,
      user: "sensecode-vscode-extension",
      ...config
    };

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
      }, (err) => {
        reject(err);
      }).catch(e => {
        reject(e);
      });

  });
}
