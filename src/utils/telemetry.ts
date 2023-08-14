import { Resource } from '@opentelemetry/resources';
import { SemanticResourceAttributes } from '@opentelemetry/semantic-conventions';
import { BasicTracerProvider, ConsoleSpanExporter, ReadableSpan, SimpleSpanProcessor, SpanExporter } from '@opentelemetry/sdk-trace-base';
import { Disposable, ExtensionContext } from 'vscode';
import { SpanKind, context, propagation, trace } from '@opentelemetry/api';
import { ExportResult } from '@opentelemetry/core';

export interface TelemetryContext {
  traceparent: string;
}

class SenseCodeExporter implements SpanExporter {
  export(spans: ReadableSpan[], resultCallback: (result: ExportResult) => void): void {
    return new ConsoleSpanExporter().export(spans, resultCallback);
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
    if (ctx) {
      propagation.extract(context.active(), ctx);
    }
    const output: any = {};
    const tracer = this.provider.getTracer("sensecode-vscode");
    const span = tracer.startSpan(name, { kind: SpanKind.PRODUCER, root: ctx === undefined }, context.active());
    for (let key in info) {
      span.setAttribute(key, info[key]);
    }
    propagation.inject(trace.setSpan(context.active(), span), output);
    span.end();
    return output;
  }

  dispose() {
  }
}
