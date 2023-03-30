import { ExtensionContext, workspace, WorkspaceConfiguration } from "vscode";

export interface Engine {
  label: string;
  url: string;
  key: string | undefined;
  capacities: string[] | undefined;
  config: any;
}

export class Configuration {
  private configuration: WorkspaceConfiguration;
  private context: ExtensionContext;
  constructor(context: ExtensionContext) {
    this.context = context;
    this.configuration = workspace.getConfiguration("SenseCode", undefined);
    this.update();
  }

  public update() {
    this.configuration = workspace.getConfiguration("SenseCode", undefined);
    this.activeEngine = this.context.globalState.get("engine");
  }

  public get activeEngine(): Engine | undefined {
    return this.context.globalState.get<Engine>("engine");
  }

  public set activeEngine(engine: Engine | undefined) {
    let engines = this.engines;
    if (engine) {
      let es = engines.filter((e) => {
        return e.label === engine!.label;
      });
      if (es.length !== 0) {
        engine = es[0];
      }
    }
    if (!engine) {
      engine = engines[0];
    }
    this.context.globalState.update("engine", engine);
  }

  public get next(): any {
    return this.configuration.get("Next", {});
  }

  public get debug(): any {
    return this.configuration.get("Debug", {});
  }

  public get prompt(): any {
    return this.configuration.get("Prompt", {});
  }

  public get engines(): Engine[] {
    let es = this.configuration.get<Engine[]>("Engines", []);
    if (es.length === 0) {
      let e = {
        label: "Default",
        url: "https://ams.sensecoreapi.cn/studio/ams/data/v1/completions",
        capacities: [
          "completion"
        ],
        key: undefined,
        config: {
          model: "CodeGen-16B-mono",
          n: 1,
          // eslint-disable-next-line @typescript-eslint/naming-convention
          max_tokens: 128,
          stop: "\n\n",
          temperature: 0.8
        }
      };
      workspace.getConfiguration("SenseCode").update("Engines", [e], true);
      return [e];
    } else {
      return es;
    }
  }

  public get autoCompleteEnabled(): boolean {
    return this.context.globalState.get("CompletionAutomatically", true);
  }

  public set autoCompleteEnabled(v: boolean) {
    this.context.globalState.update("CompletionAutomatically", v);
  }

  public get printOut(): boolean {
    return this.context.globalState.get("DirectPrintOut", true);
  }

  public set printOut(v: boolean) {
    this.context.globalState.update("DirectPrintOut", v);
  }

  public get sensetive(): boolean {
    return this.context.globalState.get("sensetive", true);
  }

  public set sensetive(v: boolean) {
    this.context.globalState.update("sensetive", v);
  }
}