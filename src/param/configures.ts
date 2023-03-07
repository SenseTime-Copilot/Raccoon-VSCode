import { workspace, env, WorkspaceConfiguration, Uri } from "vscode";
import { localeCN } from "./localeCN";
import { localeEN } from "./localeEN";

export const localeTag = env.language === "zh-cn" ? localeCN : localeEN;

const defaultConfig = {
    temp: 0.8,
    topp: 0.95,
    topk: 0,
};

export class Configuration {
    static configuration: WorkspaceConfiguration;
    constructor() {
        Configuration.update();
    }

    public static update() {
        Configuration.configuration = workspace.getConfiguration("SenseCode", undefined);
    }

    public static get engineAPI(): Uri {
        let url = Configuration.configuration.get("EngineAPI", "");
        let uri = Uri.parse(url);
        return uri;
    }
    public static get autoCompleteEnabled(): boolean {
        return Configuration.configuration.get("CompletionAutomatically", true);
    }

    public static get candidateCount(): number {
        return Configuration.configuration.get("CandidateCount", 1);
    }

    public static get temp(): number {
        const modelConfig = Configuration.configuration.get("decodingStrategies", defaultConfig);
        return modelConfig.temp;
    }

    public static get topk(): number {
        const modelConfig = Configuration.configuration.get("decodingStrategies", defaultConfig);
        return modelConfig.topk;
    }

    public static get topp(): number {
        const modelConfig = Configuration.configuration.get("decodingStrategies", defaultConfig);
        return modelConfig.topp;
    }

    public static get delay(): number {
        return Configuration.configuration.get("CompletionDelay", 0.5);
    }
}