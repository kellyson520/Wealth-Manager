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
});
