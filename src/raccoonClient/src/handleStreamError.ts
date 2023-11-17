import  { AxiosError } from "axios";
import { ResponseData, Role, ResponseEvent, Message, FinishReason } from "./CodeClient";
import { IncomingMessage } from "http";

export class ResponseDataBuilder {
  private respData: ResponseData;
  constructor(id?: string, created?: number) {
    this.respData = {
      id: id ?? "",
      created: created ?? new Date().valueOf(),
      choices: []
    };
  }

  get data(): ResponseData {
    return this.respData;
  }

  append(message?: Message, finishReason?: FinishReason, index?: number) {
    if (message || finishReason) {
      this.respData.choices.push({
        index: index ?? 0,
        message,
        finishReason
      });
    }
    return this;
  }
}

export function handleStreamError(error: AxiosError, callback: (event: MessageEvent<ResponseData>) => void): void {
  if (error.response && (error.response.data instanceof IncomingMessage)) {
    error.response.data.on('data', async (v: any) => {
      let errInfo = error.response?.statusText || error.message;
      let msgstr: string = v.toString();
      try {
        errInfo = JSON.parse(msgstr).error.message;
      } catch { }
      let message: any;
      if (errInfo) {
        message = {
          role: Role.assistant,
          content: errInfo
        };
      }
      callback(new MessageEvent(
        ResponseEvent.error,
        {
          data: new ResponseDataBuilder().append(message).data
        }
      ));
    });
  } else {
    let message: any;
    if (error.message) {
      message = {
        role: Role.assistant,
        content: error.message
      };
    }
    callback(new MessageEvent(ResponseEvent.error,
      {
        data: new ResponseDataBuilder().append(message).data
      })
    );
  }
}
