import { sensecodeManager } from "../extension";
import axios from 'axios';

export class SenseCodeTelemetry {
  private readonly apiUrl: string = "https://events.statsigapi.net/v1/log_event";
  private readonly apiKey: string = "client-xPlbzgr16c1Y463HQTOxqr8k7qnLxdECXfMIYudSI3C";
  constructor(private readonly agent: string, private readonly machineId: string) {
  }

  public async sendTelemetry(name: string, info: Record<string, string> | undefined) {
    let metadata = info || {};
    let headers = {
      // eslint-disable-next-line @typescript-eslint/naming-convention
      "statsig-api-key": this.apiKey,
      // eslint-disable-next-line @typescript-eslint/naming-convention
      "Content-Type": "application/json"
    };
    let payload = {
      events: [{
        user: {
          userID: sensecodeManager.userId() || this.machineId,
          userAgent: this.agent
        },
        eventName: name,
        metadata
      }]
    };

    axios.post(this.apiUrl, payload, { headers });
  }
}
