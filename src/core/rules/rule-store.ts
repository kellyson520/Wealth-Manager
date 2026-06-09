import { v4 as uuidv4 } from 'uuid';
import { getDatabase } from '../database/database';
import { captureError } from '../logger/logger';
import {
  ClassificationRule,
  RuleAction,
  RuleConditionGroup,
  RuleQueryParams,
} from './rule-types';

export async function initRulesTable(): Promise<void> {
  const db = await getDatabase();
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS classification_rules (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT DEFAULT '',
      priority INTEGER DEFAULT 0,
      enabled INTEGER DEFAULT 1,
      conditions TEXT NOT NULL,
      actions TEXT NOT NULL,
      hit_count INTEGER DEFAULT 0,
      last_hit_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      created_by TEXT DEFAULT 'system'
    );
  `);
  await seedDefaultRules(db);
}

async function seedDefaultRules(
  db: Awaited<ReturnType<typeof getDatabase>>
): Promise<void> {
  const result = await db.getFirstAsync<{ count: number }>(
    'SELECT COUNT(*) as count FROM classification_rules'
  );
  if (result && result.count > 0) return;

  const now = new Date().toISOString();

  const defaultRules: {
    name: string;
    description: string;
    priority: number;
    conditions: RuleConditionGroup;
    actions: unknown[];
  }[] = [
    {
      name: '餐饮自动分类',
      description: '匹配含餐饮关键词的账单',
      priority: 10,
      conditions: {
        operator: 'or',
        conditions: [
          {
            field: 'merchant',
            operator: 'contains',
            value: '饭',
          },
          {
            field: 'merchant',
            operator: 'contains',
            value: '餐',
          },
          {
            field: 'merchant',
            operator: 'contains',
            value: '面',
          },
          {
            field: 'merchant',
            operator: 'contains',
            value: '菜',
          },
          {
            field: 'merchant',
            operator: 'contains',
            value: '奶茶',
          },
          {
            field: 'merchant',
            operator: 'contains',
            value: '咖啡',
          },
          {
            field: 'merchant',
            operator: 'contains',
            value: '外卖',
          },
          {
            field: 'merchant',
            operator: 'contains',
            value: '食堂',
          },
          {
            field: 'merchant',
            operator: 'contains',
            value: '餐厅',
          },
          {
            field: 'merchant',
            operator: 'contains',
            value: '火锅',
          },
          {
            field: 'merchant',
            operator: 'contains',
            value: '烧烤',
          },
          {
            field: 'merchant',
            operator: 'contains',
            value: '水果',
          },
          {
            field: 'merchant',
            operator: 'contains',
            value: '美团',
          },
          {
            field: 'merchant',
            operator: 'contains',
            value: '饿了么',
          },
        ],
      },
      actions: [{ type: 'set_category', target: 'category', value: '餐饮', confidence: 0.9 }],
    },
    {
      name: '交通自动分类',
      description: '匹配含交通关键词的账单',
      priority: 10,
      conditions: {
        operator: 'or',
        conditions: [
          {
            field: 'merchant',
            operator: 'contains',
            value: '地铁',
          },
          {
            field: 'merchant',
            operator: 'contains',
            value: '公交',
          },
          {
            field: 'merchant',
            operator: 'contains',
            value: '打车',
          },
          {
            field: 'merchant',
            operator: 'contains',
            value: '滴滴',
          },
          {
            field: 'merchant',
            operator: 'contains',
            value: '出租',
          },
          {
            field: 'merchant',
            operator: 'contains',
            value: '油',
          },
          {
            field: 'merchant',
            operator: 'contains',
            value: '停车',
          },
          {
            field: 'merchant',
            operator: 'contains',
            value: '高铁',
          },
          {
            field: 'merchant',
            operator: 'contains',
            value: '机票',
          },
        ],
      },
      actions: [{ type: 'set_category', target: 'category', value: '交通', confidence: 0.9 }],
    },
    {
      name: '购物自动分类',
      description: '匹配含购物关键词的账单',
      priority: 10,
      conditions: {
        operator: 'or',
        conditions: [
          {
            field: 'merchant',
            operator: 'contains',
            value: '淘宝',
          },
          {
            field: 'merchant',
            operator: 'contains',
            value: '京东',
          },
          {
            field: 'merchant',
            operator: 'contains',
            value: '拼多多',
          },
          {
            field: 'merchant',
            operator: 'contains',
            value: '超市',
          },
          {
            field: 'merchant',
            operator: 'contains',
            value: '商场',
          },
          {
            field: 'merchant',
            operator: 'contains',
            value: '衣服',
          },
          {
            field: 'merchant',
            operator: 'contains',
            value: '鞋',
          },
          {
            field: 'merchant',
            operator: 'contains',
            value: '百货',
          },
        ],
      },
      actions: [{ type: 'set_category', target: 'category', value: '购物', confidence: 0.9 }],
    },
    {
      name: '大额消费标记',
      description: '标记超过月均3倍的单笔支出',
      priority: 5,
      conditions: {
        operator: 'and',
        conditions: [
          { field: 'amount', operator: 'gt', value: 1000 },
        ],
      },
      actions: [
        { type: 'flag_anomaly', target: 'bill', value: '大额消费提醒', confidence: 0.7 },
      ],
    },
  ];

  for (const rule of defaultRules) {
    const id = uuidv4();
    await db.runAsync(
      `INSERT INTO classification_rules (id, name, description, priority, enabled, conditions, actions, created_at, updated_at, created_by)
       VALUES (?, ?, ?, ?, 1, ?, ?, ?, ?, 'system')`,
      [
        id,
        rule.name,
        rule.description,
        rule.priority,
        JSON.stringify(rule.conditions),
        JSON.stringify(rule.actions),
        now,
        now,
      ]
    );
  }
}

export async function addRule(params: {
  name: string;
  description?: string;
  priority?: number;
  conditions: RuleConditionGroup;
  actions: unknown[];
  createdBy?: 'system' | 'user' | 'agent';
}): Promise<ClassificationRule | null> {
  const db = await getDatabase();
  const id = uuidv4();
  const now = new Date().toISOString();

  try {
    await db.runAsync(
      `INSERT INTO classification_rules (id, name, description, priority, enabled, conditions, actions, created_at, updated_at, created_by)
       VALUES (?, ?, ?, ?, 1, ?, ?, ?, ?, ?)`,
      [
        id,
        params.name,
        params.description || '',
        params.priority || 0,
        JSON.stringify(params.conditions),
        JSON.stringify(params.actions),
        now,
        now,
        params.createdBy || 'user',
      ]
    );

    return {
      id,
      name: params.name,
      description: params.description || '',
      priority: params.priority || 0,
      enabled: true,
      conditions: params.conditions,
      actions: params.actions as ClassificationRule['actions'],
      hitCount: 0,
      createdAt: now,
      updatedAt: now,
      createdBy: params.createdBy || 'user',
    };
  } catch (e) {
    captureError('RuleStore.addRule', e, 'Failed to add rule');
    return null;
  }
}

export async function searchRules(
  params: RuleQueryParams = {}
): Promise<ClassificationRule[]> {
  const db = await getDatabase();
  const conditions: string[] = [];
  const values: (string | number | null)[] = [];

  if (params.keyword) {
    conditions.push('(name LIKE ? OR description LIKE ?)');
    const kw = `%${params.keyword}%`;
    values.push(kw, kw);
  }
  if (params.enabled !== undefined) {
    conditions.push('enabled = ?');
    values.push(params.enabled ? 1 : 0);
  }
  if (params.createdBy) {
    conditions.push('created_by = ?');
    values.push(params.createdBy);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const limit = Math.min(Math.max(params.limit || 50, 1), 200);
  const offset = Math.max(params.offset || 0, 0);

  try {
    const rows = await db.getAllAsync<{
      id: string;
      name: string;
      description: string;
      priority: number;
      enabled: number;
      conditions: string;
      actions: string;
      hit_count: number;
      last_hit_at: string | null;
      created_at: string;
      updated_at: string;
      created_by: string;
    }>(
      `SELECT * FROM classification_rules ${where} ORDER BY priority DESC, created_at DESC LIMIT ? OFFSET ?`,
      [...values, limit, offset]
    );

    return rows.map((row) => {
      let conditions: RuleConditionGroup;
      let actions: RuleAction[];
      try {
        conditions = JSON.parse(row.conditions);
        if (!conditions || typeof conditions !== 'object' || !('operator' in conditions)) {
          conditions = { operator: 'and', conditions: [] };
        }
      } catch {
        conditions = { operator: 'and', conditions: [] };
      }
      try {
        actions = JSON.parse(row.actions);
        if (!Array.isArray(actions)) {
          actions = [];
        }
      } catch {
        actions = [];
      }
      return {
        id: row.id,
        name: row.name,
        description: row.description,
        priority: row.priority,
        enabled: row.enabled === 1,
        conditions,
        actions,
        hitCount: row.hit_count,
        lastHitAt: row.last_hit_at || undefined,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        createdBy: row.created_by as 'system' | 'user' | 'agent',
      };
    });
  } catch (e) {
    captureError('RuleStore.searchRules', e, 'Failed to search rules');
    return [];
  }
}

export async function updateRule(
  id: string,
  updates: Partial<{
    name: string;
    description: string;
    priority: number;
    enabled: boolean;
    conditions: RuleConditionGroup;
    actions: unknown[];
  }>
): Promise<boolean> {
  const db = await getDatabase();
  const now = new Date().toISOString();

  const setClauses: string[] = [];
  const values: (string | number | null)[] = [];

  if (updates.name !== undefined) {
    setClauses.push('name = ?');
    values.push(updates.name);
  }
  if (updates.description !== undefined) {
    setClauses.push('description = ?');
    values.push(updates.description);
  }
  if (updates.priority !== undefined) {
    setClauses.push('priority = ?');
    values.push(updates.priority);
  }
  if (updates.enabled !== undefined) {
    setClauses.push('enabled = ?');
    values.push(updates.enabled ? 1 : 0);
  }
  if (updates.conditions !== undefined) {
    setClauses.push('conditions = ?');
    values.push(JSON.stringify(updates.conditions));
  }
  if (updates.actions !== undefined) {
    setClauses.push('actions = ?');
    values.push(JSON.stringify(updates.actions));
  }

  if (setClauses.length === 0) return false;

  setClauses.push('updated_at = ?');
  values.push(now);

  try {
    values.push(id);
    const result = await db.runAsync(
      `UPDATE classification_rules SET ${setClauses.join(', ')} WHERE id = ?`,
      values
    );
    return result.changes > 0;
  } catch (e) {
    captureError('RuleStore.updateRule', e, 'Failed to update rule');
    return false;
  }
}

export async function deleteRule(id: string): Promise<boolean> {
  const db = await getDatabase();
  try {
    const result = await db.runAsync('DELETE FROM classification_rules WHERE id = ?', [id]);
    return result.changes > 0;
  } catch (e) {
    captureError('RuleStore.deleteRule', e, 'Failed to delete rule');
    return false;
  }
}

export async function recordRuleHit(id: string): Promise<void> {
  const db = await getDatabase();
  const now = new Date().toISOString();
  try {
    await db.runAsync(
      'UPDATE classification_rules SET hit_count = hit_count + 1, last_hit_at = ? WHERE id = ?',
      [now, id]
    );
  } catch (e) {
    captureError('RuleStore.recordHit', e as Error, 'Failed to update rule hit count');
  }
}
