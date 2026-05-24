import { v4 as uuidv4 } from 'uuid';
import { LogEntry, LogLevel } from '../../shared/types';

const MAX_BUFFER = 500;
const BUFFER_TRIM_COUNT = 100;

class Logger {
  private buffer: LogEntry[] = [];
  private listeners: Array<() => void> = [];

  private trim(): void {
    if (this.buffer.length > MAX_BUFFER) {
      this.buffer = this.buffer.slice(-BUFFER_TRIM_COUNT);
    }
  }

  private push(
    level: LogLevel,
    tag: string,
    message: string,
    detail?: string,
    data?: unknown,
  ): void {
    const entry: LogEntry = {
      id: uuidv4(),
      timestamp: new Date().toISOString(),
      level,
      tag,
      message,
      detail,
      data,
    };
    this.buffer.push(entry);
    this.trim();
    this.listeners.forEach((fn) => fn());
  }

  debug(tag: string, message: string, data?: unknown): void {
    this.push('debug', tag, message, undefined, data);
  }

  info(tag: string, message: string, data?: unknown): void {
    this.push('info', tag, message, undefined, data);
  }

  warn(tag: string, message: string, detail?: string, data?: unknown): void {
    this.push('warn', tag, message, detail, data);
  }

  error(tag: string, message: string, detail?: string, data?: unknown): void {
    this.push('error', tag, message, detail, data);
  }

  fatal(tag: string, message: string, detail?: string, data?: unknown): void {
    this.push('fatal', tag, message, detail, data);
  }

  getLogs(level?: LogLevel): LogEntry[] {
    if (!level) return [...this.buffer];
    return this.buffer.filter((e) => e.level === level);
  }

  clear(): void {
    this.buffer = [];
  }

  exportString(): string {
    return this.buffer
      .map(
        (e) =>
          `[${e.timestamp}] [${e.level.toUpperCase()}] [${e.tag}] ${e.message}${e.detail ? '\n  ' + e.detail : ''}`,
      )
      .join('\n');
  }

  subscribe(fn: () => void): () => void {
    this.listeners.push(fn);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== fn);
    };
  }
}

export const logger = new Logger();

export function captureError(
  tag: string,
  e: unknown,
  context?: string,
): void {
  const message = context || 'An error occurred';
  const detail =
    e instanceof Error
      ? `${e.message}\n${e.stack || ''}`
      : String(e ?? 'Unknown error');
  logger.error(tag, message, detail);
}
