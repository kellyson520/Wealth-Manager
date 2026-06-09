import { handleIntent } from '../../agents/guardian/guardian.agent';
import { sanitizeText, sanitizeCloudData } from '../../agents/guardian/guardian.agent';

const mockSyncUploadHandler = jest.fn().mockResolvedValue({ success: true });
const mockRevokeCloudTool = { handler: jest.fn().mockResolvedValue({ success: true }) };
const mockRepairHashChainTool = { handler: jest.fn().mockResolvedValue({ success: true }) };
const mockExecuteTool = jest.fn().mockResolvedValue({ success: true });
const mockGetSyncStatusHandler = jest.fn().mockResolvedValue({
  success: true,
  data: { configured: true, enabled: true, lastSync: null },
});

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
  getTool: jest.fn((name: string) => {
    if (name === 'get_sync_status') {
      return { handler: mockGetSyncStatusHandler };
    }
    if (name === 'sync_upload') {
      return { handler: mockSyncUploadHandler };
    }
    if (name === 'revoke_cloud_access') {
      return mockRevokeCloudTool;
    }
    if (name === 'repair_hash_chain') {
      return mockRepairHashChainTool;
    }
    return undefined;
  }),
  executeTool: (...args: unknown[]) => mockExecuteTool(...args),
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

    test('blocks writes when safety check fails', async () => {
      const { run_safety_check } = require('../../tools/security/security.tool');
      const { preActionCheck } = require('../../agents/guardian/guardian.agent');

      run_safety_check.mockResolvedValueOnce({ success: false, error: 'scanner unavailable' });

      await expect(preActionCheck({ amount: 100, merchant: '测试商户' })).resolves.toEqual({
        safe: false,
        message: '安全预检失败，请稍后重试。',
      });
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

    test('requires explicit confirmation before repairing the hash chain', async () => {
      const { repair_hash_chain } = require('../../tools/security/security.tool');

      const reply = await handleIntent({
        intent: 'repair_chain',
        params: {},
        confidence: 0.8,
        agent: 'guardian',
      });

      expect(reply).toContain('需要用户确认');
      expect(repair_hash_chain).not.toHaveBeenCalled();
      expect(mockExecuteTool).not.toHaveBeenCalled();
    });

    test('repairs the hash chain through the tool execution boundary after confirmation', async () => {
      const reply = await handleIntent({
        intent: 'repair_chain',
        params: { confirmed: true },
        confidence: 0.8,
        agent: 'guardian',
      });

      expect(mockExecuteTool).toHaveBeenCalledWith(
        mockRepairHashChainTool,
        { confirmed: true },
        { agentId: 'guardian', userConfirmed: true }
      );
      expect(reply).toContain('哈希链已修复');
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

    test('requires explicit confirmation before WebDAV upload', async () => {
      const reply = await handleIntent({
        intent: 'sync_webdav',
        params: { upload: true },
        confidence: 0.8,
        agent: 'guardian',
      });

      expect(reply).toContain('需要明确确认');
      expect(mockSyncUploadHandler).not.toHaveBeenCalled();
    });

    test('uploads to WebDAV only after confirmation', async () => {
      const reply = await handleIntent({
        intent: 'sync_webdav',
        params: { upload: true, confirmed: true },
        confidence: 0.8,
        agent: 'guardian',
      });

      expect(mockSyncUploadHandler).toHaveBeenCalledWith({ confirmed: true });
      expect(reply).toContain('数据已成功上传');
    });

    test('requires explicit confirmation before revoking cloud access', async () => {
      const { revoke_cloud_access } = require('../../tools/security/security.tool');

      const reply = await handleIntent({
        intent: 'revoke_cloud',
        params: {},
        confidence: 0.8,
        agent: 'guardian',
      });

      expect(reply).toContain('需要用户确认');
      expect(revoke_cloud_access).not.toHaveBeenCalled();
      expect(mockExecuteTool).not.toHaveBeenCalled();
    });

    test('revokes cloud access through the tool execution boundary after confirmation', async () => {
      const reply = await handleIntent({
        intent: 'revoke_cloud',
        params: { confirmed: true },
        confidence: 0.8,
        agent: 'guardian',
      });

      expect(mockExecuteTool).toHaveBeenCalledWith(
        mockRevokeCloudTool,
        {},
        { agentId: 'guardian', userConfirmed: true }
      );
      expect(reply).toContain('云端访问已撤销');
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
