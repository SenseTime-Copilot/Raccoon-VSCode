import { Resource } from '@opentelemetry/resources';
import { SemanticResourceAttributes } from '@opentelemetry/semantic-conventions';
import { BasicTracerProvider, ReadableSpan, SimpleSpanProcessor, SpanExporter } from '@opentelemetry/sdk-trace-base';
import { Disposable, ExtensionContext } from 'vscode';
import { context, propagation, trace } from '@opentelemetry/api';
import { ExportResult } from '@opentelemetry/core';

export interface TelemetryContext {
  traceId: string;
}

class SenseCodeExporter implements SpanExporter {
  export(spans: ReadableSpan[], resultCallback: (result: ExportResult) => void): void {
    return new SenseCodeExporter().export(spans, resultCallback);
  }

  shutdown(): Promise<void> {
    return Promise.resolve();
  }
}

export class SenseCodeTelemetry implements Disposable {
  private provider: BasicTracerProvider;
  constructor(ctx: ExtensionContext) {
    this.provider = new BasicTracerProvider({
      resource: new Resource({
        [SemanticResourceAttributes.SERVICE_NAME]: "sensecode-vscode",
        [SemanticResourceAttributes.SERVICE_VERSION]: ctx.extension.packageJSON.version,
      }),
    });

    this.provider.addSpanProcessor(new SimpleSpanProcessor(new SenseCodeExporter()));

    this.provider.register();
  }

  public sendTelemetry(name: string, info: Record<string, string>, ctx?: TelemetryContext) {
    const tracer = this.provider.getTracer("sensecode-vscode");
    const span = tracer.startSpan(name, { root: ctx === undefined }, context.active());
    for (let key in info) {
      span.setAttribute(key, info[key]);
    }
    const output = {};
    propagation.inject(trace.setSpan(context.active(), span), output);
    span.end();
  }

  dispose() {
  }
}
