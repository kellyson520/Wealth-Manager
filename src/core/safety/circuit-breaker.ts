export interface CircuitBreaker {
  failureCount: number;
  failureThreshold: number;
  cooldownMs: number;
  lastFailureTime: number;
  state: 'closed' | 'open' | 'half_open';
}

export function createCircuitBreaker(threshold: number = 5, cooldownMs: number = 30000): CircuitBreaker {
  return {
    failureCount: 0,
    failureThreshold: threshold,
    cooldownMs,
    lastFailureTime: 0,
    state: 'closed',
  };
}

export function canCall(cb: CircuitBreaker): boolean {
  if (cb.state === 'closed') return true;
  if (cb.state === 'open') {
    if (Date.now() - cb.lastFailureTime > cb.cooldownMs) {
      cb.state = 'half_open';
      return true;
    }
    return false;
  }
  return true;
}

export function recordSuccess(cb: CircuitBreaker): void {
  cb.failureCount = 0;
  cb.state = 'closed';
}

export function recordFailure(cb: CircuitBreaker): void {
  cb.failureCount++;
  cb.lastFailureTime = Date.now();
  if (cb.failureCount >= cb.failureThreshold) {
    cb.state = 'open';
  }
}

export function resetCircuitBreaker(cb: CircuitBreaker): void {
  cb.failureCount = 0;
  cb.state = 'closed';
  cb.lastFailureTime = 0;
}
