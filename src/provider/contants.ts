import axios from 'axios';
import { ClientConfig, ClientType } from "../raccoonClient/src/CodeClient";

const raccoonBaseUrl = 'https://raccoon.sensetime.com';
export const raccoonDocsUrl = `${raccoonBaseUrl}/code/docs`;
export const raccoonSignupUrl = `${raccoonBaseUrl}/register`;
export const raccoonResetPasswordUrl = `${raccoonBaseUrl}/reset-password`;

const raccoonApiBaseUrl = 'https://raccoon-api.sensetime.com/api/plugin';
const raccoonAuthBaseUrl = `${raccoonApiBaseUrl}/auth/v1`;
const raccoonTelemetryUrl = `${raccoonApiBaseUrl}/b/v1/s`;

const raccoonNovaApiBaseUrl = `${raccoonApiBaseUrl}/nova/v1/proxy`;
const raccoonCompletionUrl = `${raccoonNovaApiBaseUrl}/v1/llm/completions`;
const raccoonAssistantUrl = `${raccoonNovaApiBaseUrl}/v1/llm/chat-completions`;

export enum ModelCapacity {
  assistant = "assistant",
  completion = "completion",
  agent = "agent"
}

export interface ClientOption {
  url: string;
  template: string;
  parameters: any;
  maxInputTokenNum: number;
  totalTokenNum: number;
}

export type RaccoonClientConfig = ClientConfig & {
  [key in ModelCapacity]?: ClientOption;
};

export const builtinEngines: RaccoonClientConfig[] = [
  {
    type: ClientType.sensenova,
    robotname: "Raccoon",
    authUrl: raccoonAuthBaseUrl,
    completion: {
      url: raccoonCompletionUrl,
      template: "<LANG>[languageid]<SUF>[suffix.lines]<PRE>[prefix.lines]<COVER>[suffix.cursor]<MID>[prefix.cursor]",
      parameters: {
        model: "SenseChat-CodeCompletion-Lite",
        stop: [
          "<EOT>"
        ],
        temperature: 0.4
      },
      maxInputTokenNum: 12288,
      totalTokenNum: 16384
    },
    assistant: {
      url: raccoonAssistantUrl,
      template: "[prefix]",
      parameters: {
        model: "SenseChat-Code",
        stop: [
          "<|endofmessage|>"
        ],
        temperature: 0.4
      },
      maxInputTokenNum: 6144,
      totalTokenNum: 8192
    }
  }
];

export class RaccoonTelemetry {
  public async sendTelemetry(eventName: string, user: any, info: Record<string, string> | undefined) {
    axios.post(raccoonTelemetryUrl,
      {
        eventName,
        user,
        metadata: info || {}

      }
    );
  }
}