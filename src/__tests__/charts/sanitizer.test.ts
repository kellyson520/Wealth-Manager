import { sanitizeChartConfig } from '../../ui/charts/sanitizer';

describe('Chart config sanitizer', () => {
  test('rejects repeated script payloads across consecutive calls', () => {
    const payload = { title: { text: '<script>alert(1)</script>' } };

    expect(sanitizeChartConfig(payload).valid).toBe(false);
    expect(sanitizeChartConfig(payload).valid).toBe(false);
  });

  test('rejects repeated javascript URI payloads across consecutive calls', () => {
    const payload = { series: [{ label: { formatter: 'javascript:alert(1)' } }] };

    expect(sanitizeChartConfig(payload).valid).toBe(false);
    expect(sanitizeChartConfig(payload).valid).toBe(false);
  });

  test('rejects forbidden keys even when their value is not a string', () => {
    const payload = JSON.parse('{"series":[{"__proto__":{"polluted":true}}]}');

    const result = sanitizeChartConfig(payload);

    expect(result.valid).toBe(false);
    expect(result.error).toContain('Forbidden key');
  });

  test('rejects accessors without invoking them', () => {
    const getter = jest.fn(() => '<script>alert(1)</script>');
    const payload = { title: {} };
    Object.defineProperty(payload.title, 'text', {
      enumerable: true,
      get: getter,
    });

    const result = sanitizeChartConfig(payload);

    expect(result.valid).toBe(false);
    expect(result.error).toContain('accessor');
    expect(getter).not.toHaveBeenCalled();
  });

  test('rejects toJSON methods without invoking them', () => {
    const toJSON = jest.fn(() => ({ title: { text: '<script>alert(1)</script>' } }));
    const payload = { toJSON };

    const result = sanitizeChartConfig(payload);

    expect(result.valid).toBe(false);
    expect(result.error).toContain('non-JSON value');
    expect(toJSON).not.toHaveBeenCalled();
  });

  test('rejects oversized sparse arrays before serialization', () => {
    const payload = { series: new Array(1_000_000) };

    const result = sanitizeChartConfig(payload);

    expect(result.valid).toBe(false);
    expect(result.error).toContain('exceeds max length');
  });
});
