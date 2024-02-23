import { Message, Role } from "../../raccoonClient/CodeClient";
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

  private async _completion(args: { prompt: string }): Promise<Message> {
    let msg: Message = { role: Role.assistant, content: "" };
    await raccoonManager.completion(
      args.prompt,
      { n: 1 },
      {
        thisArg: this,
        onController(controller, thisArg) {
          thisArg.abortController = controller;
        },
        onFinish(message, thisArg) {
          msg.content = message[0]?.message?.content || "";
        },
        onError(choice, thisArg) {
          throw new Error(choice.message?.content || "");
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
          thisArg.abortController = controller;
        },
        onFinish(message, thisArg) {
          msg.content = message[0]?.message?.content || "";
        },
        onError(choice, thisArg) {
          throw new Error(choice.message?.content || "");
        },
      }, {});
    return msg;
  }
}
