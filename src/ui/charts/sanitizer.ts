const MAX_CONFIG_DEPTH = 10;
const MAX_CONFIG_SIZE = 256 * 1024;

const SCRIPT_PATTERN = /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi;
const JS_URI_PATTERN = /javascript\s*:/gi;
const EVENT_HANDLER_PATTERN = /\bon\w+\s*=/gi;
const EVAL_PATTERN = /\beval\s*\(/gi;
const FUNCTION_CONSTRUCTOR = /new\s+Function\s*\(/gi;
const SET_TIMEOUT_PATTERN = /setTimeout\s*\(/gi;
const SET_INTERVAL_PATTERN = /setInterval\s*\(/gi;
const INJECTION_PATTERNS = [
  SCRIPT_PATTERN,
  JS_URI_PATTERN,
  EVENT_HANDLER_PATTERN,
  EVAL_PATTERN,
  FUNCTION_CONSTRUCTOR,
  SET_TIMEOUT_PATTERN,
  SET_INTERVAL_PATTERN,
];
const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

function hasPattern(pattern: RegExp, value: string): boolean {
  pattern.lastIndex = 0;
  return pattern.test(value);
}

function hasInjectionPattern(value: string): boolean {
  return INJECTION_PATTERNS.some((pattern) => hasPattern(pattern, value));
}

export interface SanitizeResult {
  valid: boolean;
  config: Record<string, unknown>;
  error?: string;
}

function validateJSONDepth(obj: unknown, depth: number): boolean {
  if (depth > MAX_CONFIG_DEPTH) return false;
  if (typeof obj !== 'object' || obj === null) return true;
  if (Array.isArray(obj)) {
    for (const item of obj) {
      if (!validateJSONDepth(item, depth + 1)) return false;
    }
    return true;
  }
  for (const value of Object.values(obj as Record<string, unknown>)) {
    if (!validateJSONDepth(value, depth + 1)) return false;
  }
  return true;
}

function scanForInjection(value: unknown, path: string): string | null {
  if (typeof value === 'string') {
    if (hasInjectionPattern(value)) {
      return `Suspicious pattern at ${path}`;
    }
  }
  if (typeof value === 'object' && value !== null) {
    if (Array.isArray(value)) {
      for (let i = 0; i < value.length; i++) {
        const err = scanForInjection(value[i], `${path}[${i}]`);
        if (err) return err;
      }
    } else {
      for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
        if (FORBIDDEN_KEYS.has(k)) {
          return `Forbidden key at ${path}.${k}`;
        }
        const err = scanForInjection(v, `${path}.${k}`);
        if (err) return err;
      }
    }
  }
  return null;
}

export function sanitizeChartConfig(raw: unknown): SanitizeResult {
  if (raw === null || raw === undefined) {
    return { valid: false, config: {}, error: 'Config is null or undefined' };
  }

  let config: Record<string, unknown>;

  if (typeof raw === 'string') {
    try {
      config = JSON.parse(raw);
    } catch {
      return { valid: false, config: {}, error: 'Invalid JSON string' };
    }
  } else if (typeof raw === 'object' && !Array.isArray(raw)) {
    config = raw as Record<string, unknown>;
  } else {
    return { valid: false, config: {}, error: 'Config must be an object or JSON string' };
  }

  if (!validateJSONDepth(config, 0)) {
    return { valid: false, config: {}, error: `Config exceeds max depth of ${MAX_CONFIG_DEPTH}` };
  }

  const jsonStr = JSON.stringify(config);
  if (jsonStr.length > MAX_CONFIG_SIZE) {
    return { valid: false, config: {}, error: `Config size ${jsonStr.length} exceeds limit of ${MAX_CONFIG_SIZE}` };
  }

  if (hasPattern(SCRIPT_PATTERN, jsonStr)) {
    return { valid: false, config: {}, error: 'Config contains script tags' };
  }

  const injectionErr = scanForInjection(config, 'root');
  if (injectionErr) {
    return { valid: false, config: {}, error: injectionErr };
  }

  return { valid: true, config };
}

export function sanitizeJSONString(str: string): string {
  return str
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}
