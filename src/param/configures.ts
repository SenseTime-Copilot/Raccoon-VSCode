import { workspace } from "vscode";

const configuration = workspace.getConfiguration("SenseCode", undefined);

const defaultConfig = {
    temp: 0.8,
    topp: 0.95,
    topk: 0,
};
const modelConfig = configuration.get("DecodingStrategies", defaultConfig);
export const temp = modelConfig.temp;
export const topk = modelConfig.topk;
export const topp = modelConfig.topp;

export const completionDelay = configuration.get("CompletionDelay", 0.5);
