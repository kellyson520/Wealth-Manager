import {
  createCircuitBreaker,
  canCall,
  recordSuccess,
  recordFailure,
  resetCircuitBreaker,
  CircuitBreaker,
} from '../../core/safety/circuit-breaker';

describe('Circuit Breaker', () => {
  let breaker: CircuitBreaker;

  beforeEach(() => {
    breaker = createCircuitBreaker(5, 1000);
  });

  test('allows calls when closed', () => {
    expect(canCall(breaker)).toBe(true);
  });

  test('opens after threshold failures', () => {
    for (let i = 0; i < 5; i++) {
      recordFailure(breaker);
    }
    expect(breaker.state).toBe('open');
    expect(canCall(breaker)).toBe(false);
  });

  test('stays closed under threshold', () => {
    for (let i = 0; i < 4; i++) {
      recordFailure(breaker);
    }
    expect(breaker.state).toBe('closed');
    expect(canCall(breaker)).toBe(true);
  });

  test('transitions to half_open after cooldown', async () => {
    breaker = createCircuitBreaker(2, 50);
    recordFailure(breaker);
    recordFailure(breaker);
    expect(breaker.state).toBe('open');

    await new Promise((r) => setTimeout(r, 60));
    expect(canCall(breaker)).toBe(true);
    expect(breaker.state).toBe('half_open');
  });

  test('success in half_open resets to closed', () => {
    breaker = createCircuitBreaker(2, 1);
    recordFailure(breaker);
    recordFailure(breaker);
    expect(breaker.state).toBe('open');

    jest.spyOn(Date, 'now').mockReturnValue(Date.now() + 100);
    canCall(breaker);
    recordSuccess(breaker);
    expect(breaker.state).toBe('closed');
    expect(breaker.failureCount).toBe(0);
    jest.restoreAllMocks();
  });

  test('failure in half_open reopens', () => {
    breaker = createCircuitBreaker(2, 1);
    recordFailure(breaker);
    recordFailure(breaker);

    jest.spyOn(Date, 'now').mockReturnValue(Date.now() + 100);
    canCall(breaker);
    recordFailure(breaker);
    expect(breaker.state).toBe('open');
    jest.restoreAllMocks();
  });

  test('reset restores initial state', () => {
    for (let i = 0; i < 10; i++) {
      recordFailure(breaker);
    }
    expect(breaker.state).toBe('open');

    resetCircuitBreaker(breaker);
    expect(breaker.state).toBe('closed');
    expect(breaker.failureCount).toBe(0);
    expect(canCall(breaker)).toBe(true);
  });

  test('single failure does not trigger', () => {
    recordFailure(breaker);
    expect(breaker.state).toBe('closed');
    expect(canCall(breaker)).toBe(true);
  });

  test('custom threshold and cooldown are respected', () => {
    const cb = createCircuitBreaker(3, 5000);
    for (let i = 0; i < 2; i++) recordFailure(cb);
    expect(cb.state).toBe('closed');
    recordFailure(cb);
    expect(cb.state).toBe('open');
  });
});
