import {
  BillRecord,
  ToolResult,
  IntentResult,
  SecurityProfile,
  SafetyCheckResult,
  AgentMessage,
  ToolDefinition,
  RecurringTask,
  SavingsGoal,
  BudgetLimit,
  Achievement,
  StreakInfo,
  YearlyComparison,
  AnomalyReport,
  NetBalance,
} from '../../shared/types';

describe('Type Definitions', () => {
  describe('BillRecord', () => {
    test('valid bill record shape', () => {
      const bill: BillRecord = {
        id: 'uuid-123',
        amount: 35.50,
        type: 'expense',
        category: '餐饮',
        tags: ['午餐', '外卖'],
        merchant: '美团',
        rawDescription: '午餐外卖35.5元',
        date: '2024-01-15',
        note: '好吃',
        source: 'manual',
        createdAt: '2024-01-15T12:00:00.000Z',
      };

      expect(bill.type).toBe('expense');
      expect(bill.amount).toBeGreaterThan(0);
      expect(bill.tags).toHaveLength(2);
      expect(bill.source).toBe('manual');
    });

    test('supports income type', () => {
      const bill: BillRecord = {
        id: 'uuid-456',
        amount: 5000,
        type: 'income',
        category: '工资',
        tags: [],
        merchant: '公司',
        rawDescription: '1月工资',
        date: '2024-01-01',
        note: '',
        source: 'manual',
        createdAt: '2024-01-01T00:00:00.000Z',
      };

      expect(bill.type).toBe('income');
    });

    test('supports refund type', () => {
      const bill: BillRecord = {
        id: 'uuid-789',
        amount: 100,
        type: 'refund',
        category: '退款',
        tags: [],
        merchant: '淘宝',
        rawDescription: '退货退款',
        date: '2024-01-20',
        note: '',
        source: 'manual',
        createdAt: '2024-01-20T10:00:00.000Z',
      };

      expect(bill.type).toBe('refund');
    });
  });

  describe('ToolResult', () => {
    test('success result shape', () => {
      const result: ToolResult = {
        success: true,
        data: { id: '123', amount: 35 },
      };

      expect(result.success).toBe(true);
      expect(result.error).toBeUndefined();
    });

    test('error result shape', () => {
      const result: ToolResult = {
        success: false,
        error: '记账失败',
        errorCode: '1000',
      };

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe('1000');
      expect(result.data).toBeUndefined();
    });
  });

  describe('IntentResult', () => {
    test('valid intent result shape', () => {
      const result: IntentResult = {
        intent: 'add_expense',
        params: { amount: 35, merchant: '午饭' },
        confidence: 0.85,
        agent: 'ledger',
      };

      expect(result.confidence).toBeGreaterThanOrEqual(0);
      expect(result.confidence).toBeLessThanOrEqual(1);
      expect(['master', 'ledger', 'analyst', 'coach', 'guardian']).toContain(result.agent);
    });
  });

  describe('SafetyCheckResult', () => {
    test('safe result shape', () => {
      const result: SafetyCheckResult = {
        passed: true,
        riskLevel: 'safe',
        issues: [],
        suggestedActions: [],
      };

      expect(result.passed).toBe(true);
      expect(result.riskLevel).toBe('safe');
    });

    test('danger result with issues', () => {
      const result: SafetyCheckResult = {
        passed: false,
        riskLevel: 'danger',
        issues: [
          { type: 'amount_spike', severity: 'high', detail: '大额异常' },
          { type: 'high_frequency', severity: 'medium', detail: '高频交易' },
        ],
        suggestedActions: ['确认金额', '检查是否为本人操作'],
      };

      expect(result.issues.length).toBe(2);
      expect(result.suggestedActions.length).toBe(2);
    });
  });

  describe('AgentMessage', () => {
    test('valid message shape', () => {
      const msg: AgentMessage = {
        messageId: 'msg-123',
        timestamp: '2024-01-15T12:00:00.000Z',
        source: 'master',
        target: 'ledger',
        type: 'task.execute',
        payload: { tool: 'add_bill', params: { amount: 35 } },
        priority: 'normal',
        traceId: 'trace-123',
      };

      expect(msg.source).toBe('master');
      expect(msg.target).toBe('ledger');
      expect(msg.priority).toBe('normal');
      expect(msg.traceId).toBeDefined();
    });

    test('supports broadcast target', () => {
      const msg: AgentMessage = {
        messageId: 'msg-456',
        timestamp: new Date().toISOString(),
        source: 'guardian',
        target: 'broadcast',
        type: 'system.event',
        payload: { event: 'emergency_mode' },
        priority: 'critical',
        traceId: 'trace-456',
      };

      expect(msg.target).toBe('broadcast');
      expect(msg.priority).toBe('critical');
    });
  });

  describe('ToolDefinition', () => {
    test('valid tool definition', () => {
      const def: ToolDefinition = {
        name: 'add_bill',
        description: '创建新账单',
        permissionLevel: 1,
        parameters: [
          { name: 'amount', type: 'number', required: true, description: '金额' },
          { name: 'merchant', type: 'string', required: false, description: '商家' },
        ],
        returns: { type: 'BillRecord', description: '创建的账单记录' },
        timeout: 5000,
        retryable: true,
        idempotent: true,
      };

      expect(def.name).toBe('add_bill');
      expect(def.permissionLevel).toBe(1);
      expect(def.parameters.length).toBe(2);
      expect(def.parameters[0].required).toBe(true);
      expect(def.parameters[1].required).toBe(false);
      expect(def.timeout).toBeGreaterThan(0);
    });
  });

  describe('Complex types', () => {
    test('SavingsGoal shape', () => {
      const goal: SavingsGoal = {
        id: 'sg-1',
        name: '买车基金',
        targetAmount: 100000,
        currentAmount: 25000,
        deadline: '2025-12-31',
        createdAt: '2024-01-01',
      };

      expect(goal.targetAmount).toBe(100000);
      expect(goal.currentAmount).toBeLessThan(goal.targetAmount);
    });

    test('Achievement shape', () => {
      const achievement: Achievement = {
        id: 'ach-1',
        name: '记账达人',
        description: '连续记账30天',
        unlocked: true,
        progress: 30,
        maxProgress: 30,
        unlockedAt: '2024-02-01',
      };

      expect(achievement.unlocked).toBe(true);
      expect(achievement.progress).toBe(achievement.maxProgress);
    });

    test('StreakInfo shape', () => {
      const streak: StreakInfo = {
        currentStreak: 15,
        longestStreak: 30,
        totalDays: 100,
        lastRecordDate: '2024-01-15',
      };

      expect(streak.currentStreak).toBeGreaterThan(0);
      expect(streak.longestStreak).toBeGreaterThanOrEqual(streak.currentStreak);
    });

    test('AnomalyReport shape', () => {
      const report: AnomalyReport = {
        billId: 'bill-123',
        anomalyType: 'amount_spike',
        severity: 'high',
        detail: '单笔支出超过月均3倍',
        suggestedAction: '请确认是否为本人消费',
      };

      expect(report.billId).toBeDefined();
      expect(report.severity).toBe('high');
    });

    test('NetBalance shape', () => {
      const balance: NetBalance = {
        totalAssets: 50000,
        totalDebt: 10000,
        netWorth: 40000,
        cashBalance: 3000,
      };

      expect(balance.netWorth).toBe(balance.totalAssets - balance.totalDebt);
    });

    test('YearlyComparison shape', () => {
      const comparison: YearlyComparison = {
        year: 2024,
        totalIncome: 120000,
        totalExpense: 80000,
        monthBreakdown: [
          { month: 1, income: 10000, expense: 7000 },
          { month: 2, income: 10000, expense: 6500 },
        ],
      };

      expect(comparison.monthBreakdown.length).toBe(2);
      expect(comparison.monthBreakdown[0].month).toBe(1);
    });

    test('BudgetLimit shape', () => {
      const limit: BudgetLimit = {
        category: '餐饮',
        limit: 2000,
        period: 'monthly',
      };

      expect(limit.category).toBe('餐饮');
      expect(limit.limit).toBeGreaterThan(0);
    });

    test('RecurringTask shape', () => {
      const task: RecurringTask = {
        id: 'task-1',
        name: '记账提醒',
        type: 'reminder',
        cron: '0 20 * * *',
        enabled: true,
        lastTriggered: '2024-01-15T20:00:00.000Z',
        createdAt: '2024-01-01',
      };

      expect(task.type).toBe('reminder');
      expect(task.enabled).toBe(true);
      expect(task.cron).toMatch(/^\d+|\*+\s+\d+|\*+\s+\d+|\*+\s+\d+|\*+\s+\d+|\*+$/);
    });
  });
});
