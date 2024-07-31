import { CompletionContext, Message, Role } from "../../raccoonClient/CodeClient";
import { raccoonManager } from "../../globalEnv";
import { Toolset } from "../raccoonToolset";
import { CancellationToken } from "vscode";

export class LlmToolset implements Toolset {
  fn: { [key: string]: { func: (args: any) => Promise<Message>; description: string; parameters: { type: 'object'; properties: object } } };
  private abortController?: AbortController;

  constructor(cancel?: CancellationToken) {
    if (cancel) {
      cancel.onCancellationRequested((_e) => {
        this.abortController?.abort();
      });
    }
    this.fn = {
      'completion': {
        func: this._completion,
        description: "",
        parameters: {
          type: "object",
          properties: {}
        }
      },
      'assistant': {
        func: this._assistant,
        description: "",
        parameters: {
          type: "object",
          properties: {}
        }
      }
    };
  }

  private async _completion(args: CompletionContext): Promise<Message> {
    let msg: Message = { role: Role.assistant, content: "" };
    await raccoonManager.completion(
      args,
      { n: 1 },
      {
        thisArg: this,
        onController(controller, thisArg) {
          let h = <LlmToolset>thisArg;
          h.abortController = controller;
        },
        onFinish(message, thisArg) {
          // eslint-disable-next-line no-unused-vars
          let h = <LlmToolset>thisArg;
          msg.content = message[0]?.message?.content || "";
        },
        onError(error, thisArg) {
          // eslint-disable-next-line no-unused-vars
          let h = <LlmToolset>thisArg;
          throw new Error(error.detail || "");
        },
      },
      {});
    return msg;
  }

  private async _assistant(args: { messages: Message[] }): Promise<Message> {
    let msg: Message = { role: Role.assistant, content: "" };
    await raccoonManager.chat(
      args.messages,
      { n: 1 },
      {
        thisArg: this,
        onController(controller, thisArg) {
          let h = <LlmToolset>thisArg;
          h.abortController = controller;
        },
        onFinish(message, thisArg) {
          // eslint-disable-next-line no-unused-vars
          let h = <LlmToolset>thisArg;
          msg.content = message[0]?.message?.content || "";
        },
        onError(error, thisArg) {
          // eslint-disable-next-line no-unused-vars
          let h = <LlmToolset>thisArg;
          throw new Error(error.detail || "");
        },
      }, {});
    return msg;
  }
}
