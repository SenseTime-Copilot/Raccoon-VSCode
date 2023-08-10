import { Resource } from '@opentelemetry/resources';
import { SemanticResourceAttributes } from '@opentelemetry/semantic-conventions';
import { BasicTracerProvider, ConsoleSpanExporter, SimpleSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { Disposable, ExtensionContext, env } from 'vscode';

export class SenseCodeTelemetry implements Disposable {
  private provider: BasicTracerProvider;
  constructor(context: ExtensionContext) {
    this.provider = new BasicTracerProvider({
      resource: new Resource({
        [SemanticResourceAttributes.SERVICE_NAME]: 'sensecode',
        [SemanticResourceAttributes.SERVICE_INSTANCE_ID]: env.machineId,
        [SemanticResourceAttributes.SERVICE_VERSION]: context.extension.packageJSON.version
      })
    });
    this.provider.addSpanProcessor(new SimpleSpanProcessor(new ConsoleSpanExporter()));
  }

  public sendTelemetry(name: string, info: Record<string, string>) {
    const tracer = this.provider.getTracer("sensecode");
    const span = tracer.startSpan(name);
    for (let key in info) {
      span.setAttribute(key, info[key]);
    }
    span.end();
  }

  dispose() {
  }
}
