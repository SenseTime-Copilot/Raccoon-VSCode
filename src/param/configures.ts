import { workspace, env, WorkspaceConfiguration, Uri } from "vscode";
import { localeCN } from "./localeCN";
import { localeEN } from "./localeEN";

export const localeTag = env.language === "zh-cn" ? localeCN : localeEN;

export interface Engine {
    label: string;
    url: string;
    key: string | undefined;
    config: any;
}

export class Configuration {
    static configuration: WorkspaceConfiguration;
    constructor() {
        Configuration.update();
    }

    public static update() {
        Configuration.configuration = workspace.getConfiguration("SenseCode", undefined);
    }

    public static get prompt(): any {
        return Configuration.configuration.get("Prompt", {});
    }

    public static get engines(): Engine[] {
        return Configuration.configuration.get<Engine[]>("Engines", []);
    }

    public static get autoCompleteEnabled(): boolean {
        return Configuration.configuration.get("CompletionAutomatically", true);
    }

    public static get printOut(): boolean {
        return Configuration.configuration.get("DirectPrintOut", false);
    }

    public static get delay(): number {
        return Configuration.configuration.get("CompletionDelay", 0.5);
    }
}