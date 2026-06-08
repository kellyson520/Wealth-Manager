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

function validateChartValue(value: unknown, path: string, depth: number): string | null {
  if (depth > MAX_CONFIG_DEPTH) return `Config exceeds max depth of ${MAX_CONFIG_DEPTH}`;

  if (typeof value === 'string') {
    return hasInjectionPattern(value) ? `Suspicious pattern at ${path}` : null;
  }

  if (typeof value === 'function' || typeof value === 'symbol' || typeof value === 'bigint') {
    return `Config contains non-JSON value at ${path}`;
  }

  if (typeof value !== 'object' || value === null) return null;

  if (!Array.isArray(value)) {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      return `Config contains unsupported object at ${path}`;
    }
  }

  const descriptors = Object.getOwnPropertyDescriptors(value);

  for (const [key, descriptor] of Object.entries(descriptors)) {
    const nextPath = Array.isArray(value) ? `${path}[${key}]` : `${path}.${key}`;

    if (FORBIDDEN_KEYS.has(key)) {
      return `Forbidden key at ${nextPath}`;
    }

    if (descriptor.get || descriptor.set) {
      return `Config contains accessor at ${nextPath}`;
    }

    const err = validateChartValue(descriptor.value, nextPath, depth + 1);
    if (err) return err;
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

  const validationErr = validateChartValue(config, 'root', 0);
  if (validationErr) {
    return { valid: false, config: {}, error: validationErr };
  }

  let jsonStr: string;
  try {
    jsonStr = JSON.stringify(config);
  } catch {
    return { valid: false, config: {}, error: 'Config must be JSON serializable' };
  }

  if (jsonStr.length > MAX_CONFIG_SIZE) {
    return { valid: false, config: {}, error: `Config size ${jsonStr.length} exceeds limit of ${MAX_CONFIG_SIZE}` };
  }

  if (hasPattern(SCRIPT_PATTERN, jsonStr)) {
    return { valid: false, config: {}, error: 'Config contains script tags' };
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
