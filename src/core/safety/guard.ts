export interface TokenBudget {
  monthlyLimit: number;
  used: number;
  resetDay: number;
  warningThreshold: number;
}

export interface RateLimit {
  maxCallsPerMinute: number;
  maxCallsPerHour: number;
  windowMs: number;
}

interface Counter {
  minuteCount: number;
  minuteResetAt: number;
  hourCount: number;
  hourResetAt: number;
}

export function createTokenBudget(monthlyLimit: number): TokenBudget {
  return {
    monthlyLimit,
    used: 0,
    resetDay: new Date().getDate(),
    warningThreshold: 0.8,
  };
}

export function checkTokenBudget(budget: TokenBudget, estimatedTokens: number): {
  allowed: boolean;
  remaining: number;
  warning: boolean;
  reason?: string;
} {
  const now = new Date();
  if (now.getDate() !== budget.resetDay) {
    budget.used = 0;
    budget.resetDay = now.getDate();
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

const callCounters = new Map<string, Counter>();

export function checkRateLimit(key: string, limit: RateLimit): {
  allowed: boolean;
  reason?: string;
} {
  const now = Date.now();
  let counter = callCounters.get(key);

  if (!counter) {
    counter = {
      minuteCount: 0,
      minuteResetAt: now + limit.windowMs,
      hourCount: 0,
      hourResetAt: now + 60 * 60 * 1000,
    };
    callCounters.set(key, counter);
  }

  if (now > counter.minuteResetAt) {
    counter.minuteCount = 0;
    counter.minuteResetAt = now + limit.windowMs;
  }
  if (now > counter.hourResetAt) {
    counter.hourCount = 0;
    counter.hourResetAt = now + 60 * 60 * 1000;
  }

  counter.minuteCount++;
  counter.hourCount++;
  if (counter.minuteCount > limit.maxCallsPerMinute) {
    return { allowed: false, reason: '调用频率超限，请稍后再试' };
  }
  if (counter.hourCount > limit.maxCallsPerHour) {
    return { allowed: false, reason: '小时调用次数超限，请稍后再试' };
  }

  return { allowed: true };
}

export function resetRateLimit(key: string): void {
  callCounters.delete(key);
}

export function _resetAllForTest(): void {
  callCounters.clear();
}
