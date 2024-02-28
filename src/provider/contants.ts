import axios from 'axios';
import { AuthInfo, ClientConfig } from "../raccoonClient/CodeClient";
import { env } from 'vscode';
import { raccoonManager } from '../globalEnv';

const raccoonApiBaseUrl = 'https://raccoon-api.sensetime.com/api/plugin';
const raccoonAuthBaseUrl = `${raccoonApiBaseUrl}/auth/v1`;
const raccoonTelemetryUrl = `${raccoonApiBaseUrl}/b/v1/m`;

const raccoonNovaApiBaseUrl = `${raccoonApiBaseUrl}/nova/v1/proxy`;
const raccoonCompletionUrl = `${raccoonNovaApiBaseUrl}/v1/llm/completions`;
const raccoonAssistantUrl = `${raccoonNovaApiBaseUrl}/v1/llm/chat-completions`;

export class RaccoonConstants {
  private static language: string = env.language;
  private static utmSource: string = env.appName;
  private static baseUrl = 'https://raccoon.sensetime.com';

  static get docUrl(): string {
    if (RaccoonConstants.language === 'zh-tw') {
      return `${RaccoonConstants.baseUrl}/code/docs?lang=zh-Hant`;
    }
    return `${RaccoonConstants.baseUrl}/code/docs`;
  }

  static get signupUrl(): string {
    if (RaccoonConstants.language === 'zh-tw') {
      return `${RaccoonConstants.baseUrl}/register?utm_source=${RaccoonConstants.utmSource}&lang=zh-Hant`;
    }
    return `${RaccoonConstants.baseUrl}/register?utm_source=${RaccoonConstants.utmSource}`;
  }

  static get resetPasswordUrl(): string {
    if (RaccoonConstants.language === 'zh-tw') {
      return `${RaccoonConstants.baseUrl}/login?step=forgot-password&lang=zh-Hant`;
    }
    return `${RaccoonConstants.baseUrl}/login?step=forgot-password`;
  }
}

export enum ModelCapacity {
  assistant = "assistant",
  completion = "completion",
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

export enum MetricType {
  codeCompletion = "code_completion",
  dialog = "dialog",
  commitMessage = "commit_message",
}

export class RaccoonTelemetry {
  public async sendTelemetry(authInfo: AuthInfo, metricType: MetricType, metric: Record<string, any> | undefined) {
    let metricInfo: any = {};
    metricInfo[metricType] = metric;
    metricInfo['metric_type'] = metricType.replace("_", "-");
    let telemetryUrl = raccoonManager.devConfig['telemetryUrl'] || raccoonTelemetryUrl;
    /* eslint-disable @typescript-eslint/naming-convention */
    axios.post(telemetryUrl,
      {
        common_header: {
          client_agent: env.appName,
          machine_id: env.machineId
        },
        metrics: [metricInfo],
      },
      {
        headers: {
          Authorization: `Bearer ${authInfo.weaverdKey}`
        }
      }
    );
    /* eslint-enable */
  }
}
