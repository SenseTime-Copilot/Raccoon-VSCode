import axios from 'axios';
import { raccoonManager } from "../globalEnv";
import { raccoonTelemetryUrl } from '../provider/contants';

export class RaccoonTelemetry {
  constructor(private readonly agent: string, private readonly machineId: string) {
  }

  public async sendTelemetry(name: string, info: Record<string, string> | undefined) {
    let url = raccoonManager.devConfig?.telementryUrl || raccoonTelemetryUrl;
    let metadata = info || {};
    let payload = {
      events: [{
        user: {
          userID: raccoonManager.userId() || this.machineId,
          userAgent: this.agent
        },
        eventName: name,
        metadata
      }]
    };

    axios.post(url, payload);
  }
}
