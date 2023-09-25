import axios from "axios";
import { ResponseData, Role, ResponseEvent, FinishReason, Message } from "./CodeClient";
import { IncomingMessage } from "http";

export function makeCallbackData(id: string, index: number, content?: string, created?: number, finishReason?: FinishReason): ResponseData {
  let message: Message | undefined = undefined;
  if (content) {
    message = {
      role: Role.assistant,
      content
    };
  }
  return {
    id,
    created: created ?? new Date().valueOf(),
    choices: [
      {
        index,
        message,
        finishReason
      }
    ]
  };
}

export function handleStreamError(error: Error, callback: (event: MessageEvent<ResponseData>) => void): void {
  if (axios.isCancel(error)) {
    callback(new MessageEvent(ResponseEvent.cancel));
  } else if (axios.isAxiosError(error) && error.response && (error.response.data instanceof IncomingMessage)) {
    error.response.data.on('data', async (v: any) => {
      let errInfo = error.response?.statusText || error.message;
      let msgstr: string = v.toString();
      try {
        errInfo = JSON.parse(msgstr).error.message;
      } catch { }
      callback(new MessageEvent(
        ResponseEvent.error,
        {
          data: makeCallbackData('', 0, errInfo)
        }
      ));
    });
  } else {
    callback(new MessageEvent(ResponseEvent.error, {
      data: {
        id: '',
        created: new Date().valueOf(),
        choices: [
          {
            index: 0,
            message: {
              role: Role.assistant,
              content: error.message
            }
          }
        ]
      }
    }));
  }
}
