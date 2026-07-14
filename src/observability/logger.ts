export type LogLevel = "debug" | "info" | "warn" | "error";

export interface LogFields {
  [key: string]: unknown;
}

const REDACTED_KEYS =
  /authorization|cookie|token|secret|password|documentText|fileBytes/i;

function redact(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((entry) => redact(entry));
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [
        key,
        REDACTED_KEYS.test(key) ? "[REDACTED]" : redact(entry),
      ]),
    );
  }
  return value;
}

function sanitize(fields: LogFields): LogFields {
  return Object.fromEntries(
    Object.entries(fields).map(([key, value]) => [
      key,
      REDACTED_KEYS.test(key) ? "[REDACTED]" : redact(value),
    ]),
  );
}

export class Logger {
  constructor(private readonly component = "nla-mcp") {}

  log(level: LogLevel, message: string, fields: LogFields = {}): void {
    process.stderr.write(
      `${JSON.stringify({
        timestamp: new Date().toISOString(),
        level,
        component: this.component,
        message,
        ...sanitize(fields),
      })}\n`,
    );
  }

  debug(message: string, fields?: LogFields): void {
    this.log("debug", message, fields);
  }

  info(message: string, fields?: LogFields): void {
    this.log("info", message, fields);
  }

  warn(message: string, fields?: LogFields): void {
    this.log("warn", message, fields);
  }

  error(message: string, fields?: LogFields): void {
    this.log("error", message, fields);
  }
}
