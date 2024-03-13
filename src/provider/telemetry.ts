import axios from 'axios';
import { AuthInfo } from "../raccoonClient/CodeClient";
import { env } from 'vscode';
import { raccoonConfig } from '../globalEnv';

export enum MetricType {
  codeCompletion = "code_completion",
  dialog = "dialog",
  commitMessage = "commit_message"
}

export class RaccoonTelemetry {
  public async sendTelemetry(authInfo: AuthInfo, metricType: MetricType, metric: Record<string, any> | undefined) {
    let telemetryUrl = raccoonConfig.value("telemetryApi");
    if (!telemetryUrl) {
      return;
    }
    let metricInfo: any = {};
    metricInfo[metricType] = metric;
    metricInfo['metric_type'] = metricType.replace("_", "-");
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
          Authorization: `Bearer ${authInfo.weaverdKey}`,
          "X-Org-Code": authInfo.account.orgnization?.code || ""
        }
      }
    );
    /* eslint-enable */
  }
}
