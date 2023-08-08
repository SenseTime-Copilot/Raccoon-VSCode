import { BaseChatModel, BaseChatModelParams } from 'langchain/chat_models/base';
import { BaseLanguageModelCallOptions } from 'langchain/base_language';
import { CallbackManagerForLLMRun } from 'langchain/callbacks';
import { AIMessage, BaseMessage, ChatGeneration, ChatMessage, ChatResult, HumanMessage, LLMResult, SystemMessage } from 'langchain/schema';
import { LLMChain } from "langchain/chains";
import { ChatPromptTemplate } from 'langchain/prompts';

import { AuthInfo, ChatRequestParam, CodeClient, Message, ResponseData, ResponseEvent, Role } from './CodeClient';

function sensecodeResponseToChatMessage(
  message: Message
): BaseMessage {
  switch (message.role) {
    case Role.user:
      return new HumanMessage(message.content || "");
    case Role.assistant:
      return new AIMessage(message.content || "");
    case Role.system:
      return new SystemMessage(message.content || "");
    default:
      return new ChatMessage(message.content || "", message.role ?? "unknown");
  }
}

class PenroseModel extends BaseChatModel {
  // eslint-disable-next-line @typescript-eslint/naming-convention
  lc_namespace: string[];
  client: CodeClient;
  auth: AuthInfo;

  // eslint-disable-next-line @typescript-eslint/naming-convention
  declare CallOptions: BaseLanguageModelCallOptions & ChatRequestParam;

  constructor(client: CodeClient, auth: AuthInfo, fields?: BaseChatModelParams) {
    super(fields ?? {});
    this.lc_namespace = [];
    this.client = client;
    this.auth = auth;
  }

  get callKeys(): string[] {
    return ['model', 'messages', 'n', 'maxTokens', 'stream', 'stop', 'temperature'];
  }

  _combineLLMOutput?() {
    return [];
  }

  _llmType(): string {
    return "Penrose";
  }

  invocationParams(options?: this["ParsedCallOptions"]): ChatRequestParam {
    return {
      model: options?.model ?? "",
      messages: options?.messages ?? [],
      stream: options?.stream,
      n: options?.n ?? 1,
      stop: options?.stop,
      maxTokens: options?.maxTokens ?? 0,
      temperature: options?.temperature
    };
  }

  async _generate(_messages: BaseMessage[], options: this['ParsedCallOptions'], runManager?: CallbackManagerForLLMRun | undefined): Promise<ChatResult> {
    const params = this.invocationParams(options);

    if (!params.stream) {
      let data = await this.client.getCompletions(
        this.auth,
        {
          ...params
        },
        {
          signal: options?.signal
        }
      );
      const generations: ChatGeneration[] = [];
      for (const part of data.choices) {
        const text = part.message?.content ?? "";
        generations.push({
          text,
          message: sensecodeResponseToChatMessage(part.message ?? { role: Role.assistant, content: "" })
        });
      }
      return {
        generations
      };
    } else {
      return await new Promise<ChatResult>((resolve, _reject) => {
        this.client.getCompletionsStreaming(
          this.auth,
          {
            ...params,
          },
          (event: MessageEvent<ResponseData>) => {
            if (event.type === ResponseEvent.done) {
              void runManager?.handleLLMEnd({ generations: [[{ text: "" }]] });
              resolve({ generations: [{ text: "", message: new AIMessage("") }] });
              return;
            }
            if (event.type === ResponseEvent.cancel) {
              void runManager?.handleLLMEnd({ generations: [[{ text: "" }]] });
              resolve({ generations: [{ text: "", message: new AIMessage("") }] });
              return;
            }
            for (const part of event.data?.choices ?? []) {
              if (event.type === ResponseEvent.error) {
                void runManager?.handleLLMError(new Error(part.message.content));
              } else {
                void runManager?.handleLLMNewToken(
                  part.message.content ?? "",
                  {
                    prompt: 0,
                    completion: part.index,
                  }
                );
              }
            }
          },
          {
            signal: options?.signal
          }
        );
      });
    }
  }
}

export class SenseCodeLangChain {
  private chain: LLMChain;
  constructor(client: CodeClient, auth: AuthInfo) {
    this.chain = this.createConversationChain(client, auth);
  }

  private createConversationChain(client: CodeClient, auth: AuthInfo): LLMChain {
    let model = new PenroseModel(client, auth);
    return new LLMChain({
      llm: model,
      prompt: ChatPromptTemplate.fromPromptMessages([])
    });
  }

  public async callStreaming(config: ChatRequestParam, callback: (data: MessageEvent<ResponseData>) => void, signal: AbortSignal) {
    this.chain.call({ ...config, stream: true, signal }, [{
      handleLLMNewToken(data: string, idx) {
        callback(new MessageEvent(ResponseEvent.data, {
          data: {
            id: idx.prompt.toString(), created: new Date().valueOf(), choices: [{ index: idx.completion, message: { role: Role.assistant, content: data } }]
          }
        }));
      },
      handleLLMEnd(output: LLMResult, id) {
        callback(new MessageEvent(ResponseEvent.done, {
          data: {
            id, created: new Date().valueOf(), choices: []
          }
        }));
      },
      handleLLMError(err: Error, id) {
        callback(new MessageEvent(ResponseEvent.error, {
          data: {
            id, created: new Date().valueOf(), choices: [{ index: 0, message: { role: Role.assistant, content: err.message } }]
          }
        }));
      },
    }]);
  }
}