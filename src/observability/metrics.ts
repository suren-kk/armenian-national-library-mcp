import type { Logger } from "./logger.js";

export type MetricLabels = Readonly<Record<string, string | number | boolean>>;

export interface Metrics {
  increment(name: string, value?: number, labels?: MetricLabels): void;
  observe(name: string, value: number, labels?: MetricLabels): void;
  set(name: string, value: number, labels?: MetricLabels): void;
}

export const noopMetrics: Metrics = Object.freeze({
  increment: () => undefined,
  observe: () => undefined,
  set: () => undefined,
});

export function metricsForMode(mode: "none" | "log", logger: Logger): Metrics {
  return mode === "log" ? new LogMetrics(logger) : noopMetrics;
}

/** Optional exporter for deployments that collect structured stderr logs. */
export class LogMetrics implements Metrics {
  constructor(private readonly logger: Logger) {}

  increment(name: string, value = 1, labels: MetricLabels = {}): void {
    this.logger.info("metric", { kind: "counter", name, value, labels });
  }

  observe(name: string, value: number, labels: MetricLabels = {}): void {
    this.logger.info("metric", { kind: "histogram", name, value, labels });
  }

  set(name: string, value: number, labels: MetricLabels = {}): void {
    this.logger.info("metric", { kind: "gauge", name, value, labels });
  }
}
