import { handleIntent } from '../../agents/guardian/guardian.agent';
import { sanitizeText, sanitizeCloudData } from '../../agents/guardian/guardian.agent';

jest.mock('../../tools/security/security.tool', () => ({
  run_safety_check: jest.fn().mockResolvedValue({
    success: true,
    data: {
      passed: true,
      riskLevel: 'safe',
      issues: [],
      suggestedActions: [],
    },
  }),
  analyze_subscriptions: jest.fn().mockResolvedValue({
    success: true,
    data: [],
  }),
  sanitize_input: jest.fn().mockImplementation((text: string) => ({
    success: true,
    data: text.replace(/<script>.*?<\/script>/gi, '')
      .replace(/javascript:/gi, '')
      .replace(/on\w+=/gi, ''),
  })),
  sanitize_for_cloud: jest.fn().mockImplementation((data: Record<string, unknown>) => {
    const allowed = ['date', 'amount', 'category', 'type', 'period'];
    const filtered: Record<string, unknown> = {};
    for (const key of allowed) {
      if (key in data) filtered[key] = data[key];
    }
    return { success: true, data: filtered };
  }),
  verify_hash_chain: jest.fn().mockResolvedValue({ success: true }),
  repair_hash_chain: jest.fn().mockResolvedValue({ success: true }),
  export_audit_package: jest.fn().mockResolvedValue({
    success: true,
    data: { entries: [], exportedAt: new Date().toISOString() },
  }),
  get_privacy_report: jest.fn().mockResolvedValue({
    success: true,
    data: {
      totalBills: 100,
      uniqueCategories: 8,
      auditLogEntries: 200,
      dataLocation: 'local_only',
      cloudSyncEnabled: false,
    },
  }),
  revoke_cloud_access: jest.fn().mockResolvedValue({ success: true }),
}));

jest.mock('../../tools/automation/automation.tool', () => ({
  create_recurring_task: jest.fn().mockResolvedValue({ success: true }),
  get_recurring_tasks: jest.fn().mockResolvedValue({
    success: true,
    data: [],
  }),
  delete_recurring_task: jest.fn().mockResolvedValue({ success: true }),
  register_shortcut: jest.fn().mockResolvedValue({ success: true }),
  schedule_local_notification: jest.fn().mockResolvedValue({ success: true }),
  get_notification_permission_status: jest.fn().mockResolvedValue({
    success: true,
    data: { permission: 'granted', canSchedule: true },
  }),
}));

jest.mock('../../agents/_shared', () => ({
  getSecurityProfile: jest.fn().mockReturnValue({
    agentId: 'guardian',
    maxPermissionLevel: 2,
  }),
  canCallTool: jest.fn().mockReturnValue({ allowed: true, reason: '' }),
  rememberThis: jest.fn().mockResolvedValue(undefined),
  rememberMoment: jest.fn().mockResolvedValue(undefined),
}));

describe('Guardian Agent', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('sanitizeText', () => {
    test('removes script tags', () => {
      const result = sanitizeText('<script>alert("xss")</script>hello');
      expect(result).not.toContain('<script>');
      expect(result).toContain('hello');
    });

    test('removes javascript protocol', () => {
      const result = sanitizeText('hello javascript:void(0)');
      expect(result).not.toContain('javascript:');
      expect(result).toContain('hello');
    });

    test('removes event handlers', () => {
      const result = sanitizeText('<img onerror=alert(1)>');
      expect(result).not.toContain('onerror');
    });

    test('clean text unchanged', () => {
      const clean = '正常的文本内容';
      expect(sanitizeText(clean)).toBe(clean);
    });

    test('empty string returns empty', () => {
      expect(sanitizeText('')).toBe('');
    });
  });

  describe('sanitizeCloudData', () => {
    test('filters to allowed fields only', () => {
      const data = {
        date: '2024-01-15',
        amount: 100,
        category: '餐饮',
        type: 'expense',
        period: 'month',
        merchant: '秘密商家',
        note: '私密备注',
        userId: 'user-123',
        rawDescription: '敏感描述',
      };

      const result = sanitizeCloudData(data);
      expect(Object.keys(result)).toEqual(['date', 'amount', 'category', 'type', 'period']);
      expect(result).not.toHaveProperty('merchant');
      expect(result).not.toHaveProperty('note');
      expect(result).not.toHaveProperty('userId');
    });

    test('handles empty object', () => {
      expect(sanitizeCloudData({})).toEqual({});
    });
  });

  describe('preActionCheck', () => {
    test('preActionCheck module is importable', () => {
      const { preActionCheck } = require('../../agents/guardian/guardian.agent');
      expect(preActionCheck).toBeDefined();
      expect(typeof preActionCheck).toBe('function');
    });
  });

  describe('handleIntent', () => {
    test('handles safety_check intent', async () => {
      const reply = await handleIntent({
        intent: 'safety_check',
        params: {},
        confidence: 0.8,
        agent: 'guardian',
      });

      expect(reply).toContain('安全扫描通过');
    });

    test('handles privacy_report intent', async () => {
      const reply = await handleIntent({
        intent: 'privacy_report',
        params: {},
        confidence: 0.8,
        agent: 'guardian',
      });

      expect(reply).toContain('隐私报告');
      expect(reply).toContain('账单记录');
    });

    test('handles subscriptions intent with no subscriptions', async () => {
      const reply = await handleIntent({
        intent: 'subscriptions',
        params: {},
        confidence: 0.8,
        agent: 'guardian',
      });

      expect(reply).toContain('未检测到');
    });

    test('handles verify_chain intent', async () => {
      const reply = await handleIntent({
        intent: 'verify_chain',
        params: {},
        confidence: 0.8,
        agent: 'guardian',
      });

      expect(reply).toContain('哈希链');
    });

    test('handles create_reminder intent', async () => {
      const reply = await handleIntent({
        intent: 'create_reminder',
        params: { name: '测试提醒', type: 'reminder', cron: '0 20 * * *' },
        confidence: 0.8,
        agent: 'guardian',
      });

      expect(reply).toContain('已创建');
    });

    test('handles notification_status intent', async () => {
      const reply = await handleIntent({
        intent: 'notification_status',
        params: {},
        confidence: 0.8,
        agent: 'guardian',
      });

      expect(reply).toContain('通知');
      expect(reply).toContain('granted');
    });

    test('handles unknown intent with help message', async () => {
      const reply = await handleIntent({
        intent: 'unknown',
        params: {},
        confidence: 0,
        agent: 'guardian',
      });

      expect(reply).toContain('安全守护者');
    });
  });
});
