/**
 * Side-effect module: import FIRST in every service's main.ts so HTTP and pg
 * are instrumented before they are required. Tracing is enabled only when
 * OTEL_EXPORTER_OTLP_ENDPOINT is set; error reporting only when SENTRY_DSN is
 * (Sentry or GlitchTip).
 *
 * Privacy: spans carry route templates, status codes and ids only. Request and
 * response bodies are never recorded; SQL parameter values are never attached.
 */
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { registerInstrumentations } from '@opentelemetry/instrumentation';
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http';
import { PgInstrumentation } from '@opentelemetry/instrumentation-pg';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { BatchSpanProcessor, NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
import { ATTR_SERVICE_NAME } from '@opentelemetry/semantic-conventions';
import { createErrorReporter } from './error-reporter.js';

const serviceName = process.env.OTEL_SERVICE_NAME ?? process.env.SERVICE_NAME ?? 'vigil-service';
const otelEnabled = !!process.env.OTEL_EXPORTER_OTLP_ENDPOINT;

if (otelEnabled) {
  const provider = new NodeTracerProvider({
    resource: resourceFromAttributes({ [ATTR_SERVICE_NAME]: serviceName }),
    spanProcessors: [new BatchSpanProcessor(new OTLPTraceExporter())],
  });
  provider.register();
  registerInstrumentations({
    instrumentations: [
      new HttpInstrumentation({
        ignoreIncomingRequestHook: (req) => req.url === '/healthz' || req.url === '/readyz',
      }),
      new PgInstrumentation({ enhancedDatabaseReporting: false }),
    ],
  });
  process.once('beforeExit', () => void provider.shutdown());
}

export const errorReporter = createErrorReporter(process.env.SENTRY_DSN, serviceName, process.env.NODE_ENV);

if (errorReporter.enabled) {
  process.on('uncaughtExceptionMonitor', (err) => errorReporter.capture(err));
  process.on('unhandledRejection', (reason) => errorReporter.capture(reason instanceof Error ? reason : new Error(String(reason))));
}

export const telemetry = { serviceName, otelEnabled, errorReportingEnabled: errorReporter.enabled };
