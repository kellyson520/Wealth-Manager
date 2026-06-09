export interface TokenBudget {
  monthlyLimit: number;
  used: number;
  resetPeriod: string;
  warningThreshold: number;
}

export interface RateLimit {
  maxCallsPerMinute: number;
  maxCallsPerHour: number;
  windowMs: number;
}

interface Counter {
  count: number;
  resetAt: number;
}

interface DualCounter {
  minute: Counter;
  hour: Counter;
}

function getCurrentBudgetPeriod(): string {
  const now = new Date();
  return `${now.getFullYear()}-${now.getMonth()}`;
}

export function createTokenBudget(monthlyLimit: number): TokenBudget {
  return {
    monthlyLimit,
    used: 0,
    resetPeriod: getCurrentBudgetPeriod(),
    warningThreshold: 0.8,
  };
}

export function checkTokenBudget(budget: TokenBudget, estimatedTokens: number): {
  allowed: boolean;
  remaining: number;
  warning: boolean;
  reason?: string;
} {
  const currentPeriod = getCurrentBudgetPeriod();
  if (currentPeriod !== budget.resetPeriod) {
    budget.used = 0;
    budget.resetPeriod = currentPeriod;
  }

  const afterUse = budget.used + estimatedTokens;
  const ratio = afterUse / budget.monthlyLimit;

  if (ratio >= 1) {
    return {
      allowed: false,
      remaining: 0,
      warning: true,
      reason: '本月云端额度已用完，已切换离线模式',
    };
  }

  return {
    allowed: true,
    remaining: budget.monthlyLimit - afterUse,
    warning: ratio >= budget.warningThreshold,
  };
}

export function consumeTokens(budget: TokenBudget, tokens: number): void {
  budget.used += tokens;
}

const callCounters = new Map<string, DualCounter>();

export function checkRateLimit(key: string, limit: RateLimit): {
  allowed: boolean;
  reason?: string;
} {
  const now = Date.now();
  let dual = callCounters.get(key);

  if (!dual) {
    dual = {
      minute: { count: 0, resetAt: now + 60000 },
      hour: { count: 0, resetAt: now + 3600000 },
    };
    callCounters.set(key, dual);
  }

  if (now > dual.minute.resetAt) {
    dual.minute = { count: 0, resetAt: now + 60000 };
  }
  if (now > dual.hour.resetAt) {
    dual.hour = { count: 0, resetAt: now + 3600000 };
  }

  if (dual.minute.count >= limit.maxCallsPerMinute) {
    return { allowed: false, reason: '调用频率超限，请稍后再试' };
  }
  dual.minute.count++;

  if (dual.hour.count >= limit.maxCallsPerHour) {
    return { allowed: false, reason: '调用频率超限，请稍后再试' };
  }
  dual.hour.count++;

  return { allowed: true };
}

export function resetRateLimit(key: string): void {
  callCounters.delete(key);
}

export function _resetAllForTest(): void {
  callCounters.clear();
}
