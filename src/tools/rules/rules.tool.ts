import { getDatabase } from '../../core/database/database';
import { v4 as uuidv4 } from 'uuid';
import { captureError } from '../../core/logger/logger';
import {
  addRule,
  searchRules,
  updateRule,
  deleteRule,
  matchRules,
  guessCategory,
  extractActions,
} from '../../core/rules';
import type { ToolResult } from '../../shared/types';
import type { RuleConditionGroup, RuleAction } from '../../core/rules/rule-types';

export async function rules_add(params: {
  name: string;
  description?: string;
  priority?: number;
  conditions: RuleConditionGroup;
  actions: RuleAction[];
  createdBy?: 'system' | 'user' | 'agent';
}): Promise<ToolResult> {
  try {
    if (!params.name || params.name.trim().length === 0) {
      return { success: false, error: '规则名称不能为空' };
    }

    const rule = await addRule({
      name: params.name,
      description: params.description,
      priority: params.priority,
      conditions: params.conditions,
      actions: params.actions,
      createdBy: params.createdBy || 'user',
    });

    if (!rule) {
      return { success: false, error: '添加规则失败' };
    }

    return { success: true, data: rule };
  } catch (e) {
    captureError('rules_add', e, 'Failed to add rule');
    return { success: false, error: '添加规则时发生异常' };
  }
}

export async function rules_search(params: {
  keyword?: string;
  enabled?: boolean;
  createdBy?: 'system' | 'user' | 'agent';
  limit?: number;
  offset?: number;
}): Promise<ToolResult> {
  try {
    const rules = await searchRules({
      keyword: params.keyword,
      enabled: params.enabled,
      createdBy: params.createdBy,
      limit: params.limit || 50,
      offset: params.offset || 0,
    });

    return { success: true, data: rules };
  } catch (e) {
    captureError('rules_search', e, 'Failed to search rules');
    return { success: false, error: '搜索规则时发生异常' };
  }
}

export async function rules_update(params: {
  ruleId: string;
  name?: string;
  description?: string;
  priority?: number;
  enabled?: boolean;
  conditions?: RuleConditionGroup;
  actions?: RuleAction[];
}): Promise<ToolResult> {
  try {
    if (!params.ruleId) {
      return { success: false, error: '规则ID不能为空' };
    }

    const updated = await updateRule(params.ruleId, {
      name: params.name,
      description: params.description,
      priority: params.priority,
      enabled: params.enabled,
      conditions: params.conditions,
      actions: params.actions,
    });

    if (!updated) {
      return { success: false, error: '更新规则失败' };
    }

    return { success: true, data: { id: params.ruleId, updated: true } };
  } catch (e) {
    captureError('rules_update', e, 'Failed to update rule');
    return { success: false, error: '更新规则时发生异常' };
  }
}

export async function rules_delete(params: {
  ruleId: string;
}): Promise<ToolResult> {
  try {
    if (!params.ruleId) {
      return { success: false, error: '规则ID不能为空' };
    }

    const deleted = await deleteRule(params.ruleId);
    if (!deleted) {
      return { success: false, error: '删除规则失败' };
    }

    return { success: true, data: { id: params.ruleId, deleted: true } };
  } catch (e) {
    captureError('rules_delete', e, 'Failed to delete rule');
    return { success: false, error: '删除规则时发生异常' };
  }
}

export async function rules_match(params: {
  facts: Record<string, unknown>;
  maxResults?: number;
  minConfidence?: number;
}): Promise<ToolResult> {
  try {
    if (!params.facts || Object.keys(params.facts).length === 0) {
      return { success: false, error: '匹配事实不能为空' };
    }

    const results = await matchRules(params.facts, {
      maxRulesPerMatch: params.maxResults || 10,
      minConfidence: params.minConfidence || 0.3,
    });

    const extracted = extractActions(results);

    return {
      success: true,
      data: {
        matchedRules: results.map((r) => ({
          ruleId: r.rule.id,
          ruleName: r.rule.name,
          confidence: r.confidence,
          actions: r.actions,
        })),
        bestActions: extracted.actions,
        bestRule: extracted.bestRule?.name || null,
        overallConfidence: extracted.confidence,
      },
    };
  } catch (e) {
    captureError('rules_match', e, 'Failed to match rules');
    return { success: false, error: '规则匹配时发生异常' };
  }
}

export async function rules_guess(params: {
  merchant?: string;
  amount?: number;
  note?: string;
}): Promise<ToolResult> {
  try {
    const facts: Record<string, unknown> = {};
    if (params.merchant) facts.merchant = params.merchant;
    if (params.amount !== undefined) facts.amount = params.amount;
    if (params.note) facts.note = params.note;

    const result = await guessCategory(facts);

    return {
      success: true,
      data: {
        category: result.category,
        confidence: result.confidence,
        matchedRules: result.matchedRules,
      },
    };
  } catch (e) {
    captureError('rules_guess', e, 'Failed to guess category');
    return { success: false, error: '分类猜测时发生异常', data: { category: '其他', confidence: 0 } };
  }
}

export async function rules_apply(params: {
  ruleIds?: string[];
  billIds?: string[];
  facts?: Record<string, unknown>;
}): Promise<ToolResult> {
  const db = await getDatabase();
  try {
    let rulesToApply;

    if (params.ruleIds && params.ruleIds.length > 0) {
      const rules = await searchRules({ enabled: true, limit: 200 });
      rulesToApply = rules.filter((r) => params.ruleIds!.includes(r.id));
    } else {
      rulesToApply = await searchRules({ enabled: true, limit: 200 });
    }

    if (rulesToApply.length === 0) {
      return { success: false, error: '没有可应用的规则' };
    }

    let billsToUpdate: { id: string; merchant: string; amount: number }[];

    if (params.billIds && params.billIds.length > 0) {
      billsToUpdate = [];
      for (const billId of params.billIds) {
        const bill = await db.getFirstAsync<{ id: string; merchant: string; amount: number }>(
          'SELECT id, merchant, amount FROM bills WHERE id = ?',
          [billId]
        );
        if (bill) billsToUpdate.push(bill);
      }
    } else {
      const allBills = await db.getAllAsync<{ id: string; merchant: string; amount: number }>(
        'SELECT id, merchant, amount FROM bills ORDER BY date DESC LIMIT 200'
      );
      billsToUpdate = allBills;
    }

    let appliedCount = 0;
    const results: { billId: string; category: string; ruleName: string }[] = [];

    for (const bill of billsToUpdate) {
      const facts = params.facts || { merchant: bill.merchant, amount: bill.amount };
      const matchResults = await matchRules(facts, { maxRulesPerMatch: 5, minConfidence: 0.3 });
      const extracted = extractActions(matchResults);

      const categoryAction = extracted.actions.find((a) => a.type === 'set_category');
      if (categoryAction && (categoryAction as any).confidence >= 0.5) {
        await db.runAsync('UPDATE bills SET category = ? WHERE id = ?', [
          String(categoryAction.value),
          bill.id,
        ]);
        appliedCount++;
        results.push({
          billId: bill.id,
          category: String(categoryAction.value),
          ruleName: extracted.bestRule?.name || 'unknown',
        });
      }
    }

    return {
      success: true,
      data: {
        appliedCount,
        totalBills: billsToUpdate.length,
        results,
      },
    };
  } catch (e) {
    captureError('rules_apply', e, 'Failed to apply rules');
    return { success: false, error: '规则应用时发生异常' };
  }
}
