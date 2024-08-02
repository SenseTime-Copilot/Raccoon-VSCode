import * as vscode from "vscode";
import { raccoonManager, telemetryReporter, registerCommand, raccoonConfig, outlog } from "../globalEnv";
import { Choice, ErrorInfo, Message, MetricType, Role } from "../raccoonClient/CodeClient";
import { GitUtils } from "../utils/gitUtils";
import { Repository } from "../utils/git";
import { buildHeader } from "../utils/buildRequestHeader";
import { ModelCapacity } from "./config";

export class CommitMessageSuggester {
  private static abortCtrller: { [key: string]: AbortController } = {};

  static async commitMessageByLLM(context: vscode.ExtensionContext, changes: string, targetRepo: Repository): Promise<void> {
    if (CommitMessageSuggester.abortCtrller[targetRepo.rootUri.toString()] && !CommitMessageSuggester.abortCtrller[targetRepo.rootUri.toString()].signal.aborted) {
      CommitMessageSuggester.abortCtrller[targetRepo.rootUri.toString()].abort();
      delete CommitMessageSuggester.abortCtrller[targetRepo!.rootUri.toString()];
      return Promise.resolve();
    }
    targetRepo.inputBox.value = '';

    // eslint-disable-next-line @typescript-eslint/naming-convention
    telemetryReporter.logUsage(MetricType.commitMessage, { usage_num: 1 });

    let systemPrompt = raccoonConfig.systemPrompt;
    let systemMsg: Message[] = [];
    if (systemPrompt) {
      systemMsg.push({ role: Role.system, content: systemPrompt });
    }
    return raccoonManager.chat(
      [...systemMsg, { role: Role.user, content: raccoonConfig.commitTemplate({ changes }) }],
      {
        stream: true,
        maxNewTokenNum: 128,
        n: 1
      },
      {
        onHeader: (_headers: Headers) => {

        },
        onError: (e: ErrorInfo) => {
          outlog.error(JSON.stringify(e));
          vscode.window.showErrorMessage(e.detail || "", raccoonConfig.t("Close"));
        },
        onUpdate: (choice: Choice) => {
          let cmtmsg = choice.message?.content;
          if (cmtmsg && targetRepo) {
            targetRepo.inputBox.value += cmtmsg;
          }
        },
        onController(controller) {
          CommitMessageSuggester.abortCtrller[targetRepo.rootUri.toString()] = controller;
        },
        onFinish(_choices, _thisArg) {
          delete CommitMessageSuggester.abortCtrller[targetRepo!.rootUri.toString()];
        },
      },
      buildHeader(context.extension, "commit-message", `${new Date().valueOf()}`)
    ).catch(e => {
      vscode.window.showErrorMessage(e.message, raccoonConfig.t("Close"));
    });
  }

  static registerCommitMessageCommand(context: vscode.ExtensionContext): number {
    return registerCommand(context, "commit-msg", async (...args: any[]) => {
      let gitApi = await GitUtils.getInstance().api();
      if (!gitApi) {
        return;
      }
      let changes = '';
      let targetRepo: Repository | null | undefined = undefined;
      if (args[0] && args[0].rootUri) {
        targetRepo = gitApi.getRepository(args[0].rootUri);
      }
      if (!targetRepo) {
        if (gitApi.repositories.length === 1) {
          targetRepo = gitApi.repositories[0];
        } else if (gitApi.repositories.length > 1) {
          let rps = gitApi.repositories.map((repo, _idx, _arr) => {
            return repo.rootUri.toString();
          });
          let rpUri = await vscode.window.showQuickPick(rps);
          if (rpUri) {
            targetRepo = gitApi.getRepository(vscode.Uri.parse(rpUri));
          }
        }
      }
      if (!targetRepo) {
        vscode.window.showErrorMessage("No repository found", raccoonConfig.t("Close"));
        return;
      }
      changes = await targetRepo.diff(true) || await targetRepo.diff();
      if (changes) {
        if (raccoonManager.getModelCapacites().includes(ModelCapacity.assistant)) {
          CommitMessageSuggester.commitMessageByLLM(context, changes, targetRepo);
        } else {
          vscode.window.showErrorMessage("Model capacity not supported yet", raccoonConfig.t("Close"));
        }
      } else {
        vscode.window.showErrorMessage("There's no any change in stage to commit", raccoonConfig.t("Close"));
      }
    });
  }
}

