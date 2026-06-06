export type CloudField = 'date' | 'amount' | 'category' | 'type' | 'period';

const ALLOWED_CLOUD_FIELDS: CloudField[] = ['date', 'amount', 'category', 'type', 'period'];

const SENSITIVE_PATTERNS = [
  /\b\d{16,19}\b/g,
  /\b\d{3}-\d{2}-\d{4}\b/g,
  /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g,
  /\b1[3-9]\d{9}\b/g,
  /\b\d{6}(?:19|20)\d{2}(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\d|3[01])\d{3}[\dXx]\b/g,
];

export function sanitizeForCloud(data: Record<string, unknown>): Record<string, unknown> {
  const filtered: Record<string, unknown> = {};
  for (const key of ALLOWED_CLOUD_FIELDS) {
    if (key in data) {
      filtered[key] = maskIfSensitive(String(data[key]));
    }
  }
  return filtered;
}

export function sanitizeTextForCloud(text: string): string {
  return maskIfSensitive(text)
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/javascript\s*:/gi, '')
    .replace(/on\w+\s*=\s*["'][^"']*["']/gi, '')
    .replace(/\b(?:\d+(?:\.\d{1,2})?\s*(?:元|块|¥|￥|CNY|RMB)\s*){2,}/gi, '[amount_sequence]')
    .slice(0, 2000);
}

function maskIfSensitive(value: string): string {
  for (const pattern of SENSITIVE_PATTERNS) {
    if (pattern.test(value)) {
      return value.replace(pattern, '***');
    }
  }
  return value;
}

export function detectPII(text: string): { hasPII: boolean; types: string[] } {
  const types: string[] = [];
  if (/\b\d{16,19}\b/.test(text)) types.push('credit_card');
  if (/\b1[3-9]\d{9}\b/.test(text)) types.push('phone');
  if (/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/.test(text)) types.push('email');
  if (/\b\d{6}(?:19|20)\d{2}(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\d|3[01])\d{3}[\dXx]\b/.test(text))
    types.push('id_card');
  if (
    types.length === 0 &&
    (/\b(?:password|secret|token|key)\b/i.test(text) || /(密码|密钥|验证码|私钥|助记词|令牌)/i.test(text))
  ) {
    types.push('credential_keyword');
  }
  return { hasPII: types.length > 0, types };
}
