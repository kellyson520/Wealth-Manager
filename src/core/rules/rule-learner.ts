import { getDatabase } from '../database/database';
import { v4 as uuidv4 } from 'uuid';
import { captureError } from '../logger/logger';
import { addRule, searchRules } from './rule-store';
import { isValidFieldName } from './condition-parser';
import type { RuleConditionGroup, RuleAction } from './rule-types';

export async function recordCorrection(params: {
  billId: string;
  merchant: string;
  originalCategory: string;
  correctedCategory: string;
}): Promise<{ learned: boolean; ruleCreated?: boolean }> {
  try {
    const db = await getDatabase();

    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS correction_log (
        id TEXT PRIMARY KEY,
        bill_id TEXT NOT NULL,
        merchant TEXT NOT NULL,
        original_category TEXT NOT NULL,
        corrected_category TEXT NOT NULL,
        corrected_at TEXT NOT NULL
      );
    `);

    const id = uuidv4();
    const now = new Date().toISOString();
    await db.runAsync(
      'INSERT INTO correction_log (id, bill_id, merchant, original_category, corrected_category, corrected_at) VALUES (?, ?, ?, ?, ?, ?)',
      [id, params.billId, params.merchant, params.originalCategory, params.correctedCategory, now]
    );

    const similar = await db.getAllAsync<{ merchant: string; count: number }>(
      `SELECT merchant, COUNT(*) as count FROM correction_log
       WHERE corrected_category = ? AND merchant LIKE ?
       GROUP BY merchant ORDER BY count DESC LIMIT 1`,
      [params.correctedCategory, `%${params.merchant}%`]
    );

    const threshold = 3;
    const needLearn = similar.length > 0 && similar[0].count >= threshold;

    if (needLearn) {
      const existingRules = await searchRules({
        keyword: `自动学习:${params.merchant}`,
        enabled: true,
        limit: 1,
      });

      if (existingRules.length === 0) {
        const conditions: RuleConditionGroup = {
          operator: 'or',
          conditions: [
            { field: 'merchant', operator: 'contains', value: params.merchant },
          ],
        };

        const actions: RuleAction[] = [
          { type: 'set_category', target: 'category', value: params.correctedCategory, confidence: 0.85 },
        ];

        await addRule({
          name: `自动学习: ${params.merchant} → ${params.correctedCategory}`,
          description: `从 ${similar[0].count} 次用户修正中自动学习: "${params.merchant}" 分类为 "${params.correctedCategory}"`,
          priority: 7,
          conditions,
          actions,
          createdBy: 'agent',
        });

        return { learned: true, ruleCreated: true };
      }
    }

    return { learned: needLearn, ruleCreated: false };
  } catch (e) {
    captureError('RuleLearner.recordCorrection', e, 'Failed to record correction');
    return { learned: false };
  }
}

export async function getLearningStats(): Promise<{
  totalCorrections: number;
  learnedRules: number;
  topCorrections: { merchant: string; from: string; to: string; count: number }[];
}> {
  try {
    const db = await getDatabase();

    const total = await db.getFirstAsync<{ count: number }>(
      'SELECT COUNT(*) as count FROM correction_log'
    );

    const learned = await searchRules({ createdBy: 'agent', enabled: true, limit: 100 });

    const top = await db.getAllAsync<{
      merchant: string; from_cat: string; to_cat: string; count: number;
    }>(
      `SELECT merchant, original_category as from_cat, corrected_category as to_cat, COUNT(*) as count
       FROM correction_log GROUP BY merchant, corrected_category
       ORDER BY count DESC LIMIT 10`
    );

    return {
      totalCorrections: total?.count || 0,
      learnedRules: learned.length,
      topCorrections: top.map((r) => ({
        merchant: r.merchant,
        from: r.from_cat,
        to: r.to_cat,
        count: r.count,
      })),
    };
  } catch (e) {
    captureError('RuleLearner.getLearningStats', e, 'Failed to get learning stats');
    return { totalCorrections: 0, learnedRules: 0, topCorrections: [] };
  }
}

export async function applyLearnedRules(billId?: string): Promise<{
  appliedTo: number;
  createdRules: number;
}> {
  try {
    const db = await getDatabase();

    const rules = await searchRules({ createdBy: 'agent', enabled: true, limit: 100 });
    if (rules.length === 0) return { appliedTo: 0, createdRules: 0 };

    let appliedTo = 0;

    const where = billId ? 'WHERE id = ?' : "WHERE category = '其他'";
    const params: string[] = billId ? [billId] : [];

    const bills = await db.getAllAsync<{ id: string; merchant: string }>(
      `SELECT id, merchant FROM bills ${where} ORDER BY date DESC LIMIT 200`,
      params
    );

    for (const bill of bills) {
      for (const rule of rules) {
        const conditionGroup = rule.conditions;
        const matched = evaluateSimpleMatch(conditionGroup, { merchant: bill.merchant });
        if (matched) {
          const categoryAction = rule.actions.find((a) => a.type === 'set_category');
          if (categoryAction) {
            await db.runAsync(
              'UPDATE bills SET category = ? WHERE id = ?',
              [String(categoryAction.value), bill.id]
            );
            appliedTo++;
            break;
          }
        }
      }
    }

    return { appliedTo, createdRules: rules.length };
  } catch (e) {
    captureError('RuleLearner.applyLearnedRules', e, 'Failed to apply learned rules');
    return { appliedTo: 0, createdRules: 0 };
  }
}

function evaluateSimpleMatch(group: RuleConditionGroup, facts: Record<string, unknown>): boolean {
  for (const cond of group.conditions) {
    if (Object.hasOwn(cond, 'operator') && Object.hasOwn(cond, 'conditions')) {
      if (evaluateSimpleMatch(cond as RuleConditionGroup, facts)) return true;
    } else {
      const c = cond as { field: string; operator: string; value: unknown };
      if (!isValidFieldName(c.field)) continue;
      const factVal = Object.hasOwn(facts, c.field) ? facts[c.field] : undefined;
      if (c.operator === 'contains' && typeof factVal === 'string' && typeof c.value === 'string') {
        if (factVal.includes(c.value)) return true;
      }
    }
  }
  return false;
}
