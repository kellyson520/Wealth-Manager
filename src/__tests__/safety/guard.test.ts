import {
  createTokenBudget,
  checkTokenBudget,
  consumeTokens,
  checkRateLimit,
  _resetAllForTest,
  RateLimit,
} from '../../core/safety/guard';

describe('Token Budget', () => {
  let budget: ReturnType<typeof createTokenBudget>;

  beforeEach(() => {
    budget = createTokenBudget(50000);
  });

  test('allows calls under budget', () => {
    const result = checkTokenBudget(budget, 1000);
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(49000);
    expect(result.warning).toBe(false);
  });

  test('blocks when budget is exceeded', () => {
    budget.used = 49000;
    const result = checkTokenBudget(budget, 2000);
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('已用完');
  });

  test('warns at 80% threshold', () => {
    budget.used = 40000;
    const result = checkTokenBudget(budget, 2000);
    expect(result.allowed).toBe(true);
    expect(result.warning).toBe(true);
  });

  test('tracks cumulative usage', () => {
    checkTokenBudget(budget, 10000);
    consumeTokens(budget, 10000);
    expect(budget.used).toBe(10000);

    checkTokenBudget(budget, 5000);
    consumeTokens(budget, 5000);
    expect(budget.used).toBe(15000);
  });

  test('resets on new day', () => {
    budget.used = 45000;
    budget.resetDay = 15;
    const mockDate = new Date(2024, 0, 16);
    jest.spyOn(global, 'Date').mockImplementation(() => mockDate as unknown as string);

    const result = checkTokenBudget(budget, 5000);
    expect(result.allowed).toBe(true);
    expect(budget.used).toBe(0);

    jest.restoreAllMocks();
  });

  test('zero token query is always allowed', () => {
    const result = checkTokenBudget(budget, 0);
    expect(result.allowed).toBe(true);
  });

  test('massive token request is handled correctly', () => {
    const result = checkTokenBudget(budget, 999999999);
    expect(result.allowed).toBe(false);
  });
});

describe('Rate Limiter', () => {
  beforeEach(() => {
    _resetAllForTest();
  });

  test('allows calls under the limit', () => {
    for (let i = 0; i < 10; i++) {
      const result = checkRateLimit('test', {
        maxCallsPerMinute: 10,
        maxCallsPerHour: 100,
        windowMs: 60000,
      });
      expect(result.allowed).toBe(true);
    }
  });

  test('blocks calls over the per-minute limit', () => {
    for (let i = 0; i < 10; i++) {
      checkRateLimit('test', {
        maxCallsPerMinute: 10,
        maxCallsPerHour: 100,
        windowMs: 60000,
      });
    }
    const result = checkRateLimit('test', {
      maxCallsPerMinute: 10,
      maxCallsPerHour: 100,
      windowMs: 60000,
    });
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('频率超限');
  });

  test('blocks calls over the per-hour limit', () => {
    for (let i = 0; i < 3; i++) {
      const result = checkRateLimit('hourly', {
        maxCallsPerMinute: 100,
        maxCallsPerHour: 3,
        windowMs: 60000,
      });
      expect(result.allowed).toBe(true);
    }

    const result = checkRateLimit('hourly', {
      maxCallsPerMinute: 100,
      maxCallsPerHour: 3,
      windowMs: 60000,
    });

    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('小时');
  });

  test('different keys have independent limits', () => {
    for (let i = 0; i < 10; i++) {
      checkRateLimit('user_a', { maxCallsPerMinute: 10, maxCallsPerHour: 100, windowMs: 60000 });
    }
    const resultB = checkRateLimit('user_b', {
      maxCallsPerMinute: 10,
      maxCallsPerHour: 100,
      windowMs: 60000,
    });
    expect(resultB.allowed).toBe(true);
  });

  test('reset provides fresh counter', () => {
    for (let i = 0; i < 15; i++) {
      checkRateLimit('test', { maxCallsPerMinute: 10, maxCallsPerHour: 100, windowMs: 60000 });
    }
    _resetAllForTest();
    const result = checkRateLimit('test', {
      maxCallsPerMinute: 10,
      maxCallsPerHour: 100,
      windowMs: 60000,
    });
    expect(result.allowed).toBe(true);
  });
});
