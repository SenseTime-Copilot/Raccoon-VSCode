import { Message, Role } from "../../raccoonClient/src/CodeClient";
import { raccoonManager } from "../../globalEnv";
import { ModelCapacity } from "../contants";
import { Toolset } from "../raccoonToolset";

export class LlmToolset implements Toolset {
  fn: { [key: string]: { func: (args: any) => Promise<Message>; description: string; parameters: { type: 'object'; properties: object } } };

  constructor(private abortController?: AbortController, private readonly id?: string) {
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
    return raccoonManager
      .getCompletions(ModelCapacity.completion, { messages: [{ role: Role.completion, content: args.prompt }] }, { signal: this.abortController?.signal }, this.id)
      .then((resp) => {
        if (resp.choices[0]?.message) {
          return resp.choices[0]?.message;
        } else {
          throw Error();
        }
      });
  }

  private async _assistant(args: { messages: Message[] }): Promise<Message> {
    return raccoonManager
      .getCompletions(ModelCapacity.assistant, { messages: args.messages }, { signal: this.abortController?.signal }, this.id)
      .then((resp) => {
        if (resp.choices[0]?.message) {
          return resp.choices[0]?.message;
        } else {
          throw Error();
        }
      });
  }
}
