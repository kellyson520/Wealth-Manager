import { sanitizeForCloud, sanitizeTextForCloud, detectPII } from '../../core/cloud/sanitizer';

describe('Cloud Data Sanitizer', () => {
  describe('sanitizeForCloud', () => {
    test('only allows whitelisted fields', () => {
      const data = {
        date: '2024-01-15',
        amount: 100,
        category: '餐饮',
        type: 'expense',
        period: 'month',
        merchant: '敏感商家名',
        note: '私密备注',
        userId: 'user-123',
        rawDescription: '敏感描述信息',
        location: '北京朝阳',
        ip: '192.168.1.1',
      };

      const result = sanitizeForCloud(data);
      expect(Object.keys(result).sort()).toEqual(['amount', 'category', 'date', 'period', 'type']);
      expect(result).not.toHaveProperty('merchant');
      expect(result).not.toHaveProperty('note');
      expect(result).not.toHaveProperty('userId');
      expect(result).not.toHaveProperty('rawDescription');
      expect(result).not.toHaveProperty('location');
      expect(result).not.toHaveProperty('ip');
    });

    test('empty objects return empty object', () => {
      expect(sanitizeForCloud({})).toEqual({});
    });

    test('partial fields are preserved', () => {
      const result = sanitizeForCloud({ amount: 50, type: 'expense' });
      expect(result).toEqual({ amount: '50', type: 'expense' });
    });

    test('masks credit card numbers in allowed fields', () => {
      const result = sanitizeForCloud({
        amount: 100,
        category: '4111111111111111',
        type: 'expense',
      });
      expect(result.category).toBe('***');
    });

    test('masks phone numbers in allowed fields', () => {
      const result = sanitizeForCloud({
        amount: 100,
        period: '13812345678',
      });
      expect(result.period).toBe('***');
    });

    test('masks email addresses in allowed fields', () => {
      const result = sanitizeForCloud({
        amount: 100,
        type: 'user@example.com',
      });
      expect(result.type).toBe('***');
    });

    test('masks ID card numbers in allowed fields', () => {
      const result = sanitizeForCloud({
        category: '110101199001011234',
      });
      expect(result.category).toBe('***');
    });
  });

  describe('sanitizeTextForCloud', () => {
    test('removes script content from free text', () => {
      const result = sanitizeTextForCloud('hello <script>alert(1)</script> world');
      expect(result).toBe('hello  world');
    });

    test('masks repeated amount sequences in free text', () => {
      const result = sanitizeTextForCloud('10元 20元 30元');
      expect(result).toBe('[amount_sequence]');
    });
  });

  describe('detectPII', () => {
    test('detects credit card numbers', () => {
      const result = detectPII('我的信用卡号是4111111111111111');
      expect(result.hasPII).toBe(true);
      expect(result.types).toContain('credit_card');
    });

    test('detects phone numbers', () => {
      const result = detectPII('联系电话13812345678');
      expect(result.hasPII).toBe(true);
      expect(result.types).toContain('phone');
    });

    test('detects email addresses', () => {
      const result = detectPII('邮箱 user@example.com 请查收');
      expect(result.hasPII).toBe(true);
      expect(result.types).toContain('email');
    });

    test('detects ID card numbers', () => {
      const result = detectPII('身份证110101199001011234');
      expect(result.hasPII).toBe(true);
      expect(result.types).toContain('id_card');
    });

    test('detects credential keywords', () => {
      const result = detectPII('my password is 123456');
      expect(result.hasPII).toBe(true);
      expect(result.types).toContain('credential_keyword');
    });

    test('clean text has no PII', () => {
      const result = detectPII('今天午饭花了35块');
      expect(result.hasPII).toBe(false);
    });

    test('empty string has no PII', () => {
      expect(detectPII('').hasPII).toBe(false);
    });

    test('multiple PII types detected', () => {
      const result = detectPII('卡号4111111111111111，电话13812345678，邮箱a@b.com');
      expect(result.hasPII).toBe(true);
      expect(result.types.length).toBe(3);
    });
  });
});
