import * as SQLite from 'expo-sqlite';
import { v4 as uuidv4 } from 'uuid';
import { initRulesTable } from '../rules';

let db: SQLite.SQLiteDatabase | null = null;

export async function getDatabase(): Promise<SQLite.SQLiteDatabase> {
  if (db) return db;
  db = await SQLite.openDatabaseAsync('wealth_manager.db');
  await initTables(db);
  return db;
}

async function initTables(db: SQLite.SQLiteDatabase): Promise<void> {
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS bills (
      id TEXT PRIMARY KEY,
      amount REAL NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('income','expense','refund')),
      category TEXT DEFAULT '其他',
      tags TEXT DEFAULT '[]',
      merchant TEXT DEFAULT '',
      raw_description TEXT NOT NULL,
      date TEXT NOT NULL,
      note TEXT DEFAULT '',
      source TEXT DEFAULT 'manual',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS categories (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('income','expense')),
      icon TEXT DEFAULT '📦'
    );

    CREATE TABLE IF NOT EXISTS audit_log (
      id TEXT PRIMARY KEY,
      timestamp TEXT NOT NULL,
      agent TEXT NOT NULL,
      tool TEXT NOT NULL,
      action TEXT NOT NULL,
      params TEXT,
      result_status TEXT DEFAULT 'success',
      user_confirmed INTEGER DEFAULT 0,
      error_code TEXT,
      ttl_days INTEGER DEFAULT 365
    );

    CREATE TABLE IF NOT EXISTS user_profile (
      id TEXT PRIMARY KEY DEFAULT 'singleton',
      persona_params TEXT DEFAULT '{"rigor":5,"humor":5,"proactivity":5}',
      budget_limits TEXT DEFAULT '[]',
      preferences TEXT DEFAULT '{"currency":"CNY","language":"zh-Hans","theme":"dark","firstDayOfWeek":1}'
    );

    CREATE TABLE IF NOT EXISTS memories (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL CHECK(type IN ('long_term','episodic')),
      content TEXT NOT NULL,
      embedding BLOB,
      updated_at TEXT
    );

    CREATE TABLE IF NOT EXISTS savings_goals (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      target_amount REAL NOT NULL,
      current_amount REAL DEFAULT 0,
      deadline TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS achievements (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      unlocked INTEGER DEFAULT 0,
      progress INTEGER DEFAULT 0,
      max_progress INTEGER DEFAULT 1,
      unlocked_at TEXT
    );

    CREATE TABLE IF NOT EXISTS recurring_tasks (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('reminder','backup','report')),
      cron TEXT NOT NULL,
      enabled INTEGER DEFAULT 1,
      last_triggered TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS assets (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      type TEXT DEFAULT '其他' CHECK(type IN ('现金','银行账户','股票','基金','房产','车辆','债权','其他')),
      amount REAL NOT NULL DEFAULT 0,
      currency TEXT DEFAULT 'CNY',
      note TEXT DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS tags (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      color TEXT DEFAULT '#4A90D9',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS bill_tags (
      bill_id TEXT NOT NULL,
      tag_id TEXT NOT NULL,
      PRIMARY KEY (bill_id, tag_id),
      FOREIGN KEY (bill_id) REFERENCES bills(id) ON DELETE CASCADE,
      FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS debts (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('借出','借入')),
      principal REAL NOT NULL DEFAULT 0,
      remaining REAL NOT NULL DEFAULT 0,
      counterparty TEXT NOT NULL,
      interest_rate REAL DEFAULT 0,
      start_date TEXT NOT NULL,
      due_date TEXT,
      status TEXT DEFAULT 'active' CHECK(status IN ('active','cleared','overdue')),
      note TEXT DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS repayments (
      id TEXT PRIMARY KEY,
      debt_id TEXT NOT NULL,
      amount REAL NOT NULL,
      date TEXT NOT NULL,
      note TEXT DEFAULT '',
      created_at TEXT NOT NULL,
      FOREIGN KEY (debt_id) REFERENCES debts(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS reimbursement_tasks (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      amount REAL NOT NULL,
      category TEXT DEFAULT '其他',
      status TEXT DEFAULT 'pending' CHECK(status IN ('pending','submitted','approved','rejected','paid')),
      merchant TEXT DEFAULT '',
      date TEXT NOT NULL,
      note TEXT DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);

  await initRulesTable();

  await seedCategories(db);
  await seedAchievements(db);
  await seedUserProfile(db);
}

async function seedCategories(db: SQLite.SQLiteDatabase): Promise<void> {
  const result = await db.getFirstAsync<{ count: number }>(
    'SELECT COUNT(*) as count FROM categories'
  );
  if (result && result.count > 0) return;

  const expenseCategories = [
    { id: 'cat_food', name: '餐饮', type: 'expense', icon: '🍜' },
    { id: 'cat_transport', name: '交通', type: 'expense', icon: '🚗' },
    { id: 'cat_shopping', name: '购物', type: 'expense', icon: '🛒' },
    { id: 'cat_housing', name: '住房', type: 'expense', icon: '🏠' },
    { id: 'cat_entertainment', name: '娱乐', type: 'expense', icon: '🎮' },
    { id: 'cat_health', name: '医疗', type: 'expense', icon: '💊' },
    { id: 'cat_education', name: '教育', type: 'expense', icon: '📚' },
    { id: 'cat_utilities', name: '水电', type: 'expense', icon: '💡' },
    { id: 'cat_other', name: '其他', type: 'expense', icon: '📦' },
  ];

  const incomeCategories = [
    { id: 'cat_salary', name: '工资', type: 'income', icon: '💰' },
    { id: 'cat_bonus', name: '奖金', type: 'income', icon: '🎁' },
    { id: 'cat_investment', name: '投资', type: 'income', icon: '📈' },
    { id: 'cat_side', name: '兼职', type: 'income', icon: '💼' },
    { id: 'cat_other_income', name: '其他收入', type: 'income', icon: '💵' },
  ];

  for (const cat of [...expenseCategories, ...incomeCategories]) {
    await db.runAsync(
      'INSERT INTO categories (id, name, type, icon) VALUES (?, ?, ?, ?)',
      [cat.id, cat.name, cat.type, cat.icon]
    );
  }
}

export async function closeDatabase(): Promise<void> {
  if (db) {
    await db.closeAsync();
    db = null;
  }
}

async function seedAchievements(db: SQLite.SQLiteDatabase): Promise<void> {
  const result = await db.getFirstAsync<{ count: number }>(
    'SELECT COUNT(*) as count FROM achievements'
  );
  if (result && result.count > 0) return;

  const achievements = [
    { id: 'ach_first_bill', name: '初次记账', description: '记录第一笔账单', maxProgress: 1 },
    { id: 'ach_7day_streak', name: '七天坚持', description: '连续记账 7 天', maxProgress: 7 },
    { id: 'ach_30day_streak', name: '月记达人', description: '连续记账 30 天', maxProgress: 30 },
    { id: 'ach_100_bills', name: '百笔账单', description: '累计记录 100 笔账单', maxProgress: 100 },
    { id: 'ach_1000_bills', name: '千笔达人', description: '累计记录 1000 笔账单', maxProgress: 1000 },
    { id: 'ach_first_budget', name: '预算新手', description: '设置第一个预算', maxProgress: 1 },
    { id: 'ach_budget_master', name: '预算达人', description: '连续3个月不超预算', maxProgress: 3 },
    { id: 'ach_first_savings', name: '储蓄起步', description: '创建第一个储蓄目标', maxProgress: 1 },
    { id: 'ach_savings_done', name: '目标达成', description: '完成一个储蓄目标', maxProgress: 1 },
  ];

  for (const a of achievements) {
    await db.runAsync(
      'INSERT INTO achievements (id, name, description, max_progress) VALUES (?, ?, ?, ?)',
      [a.id, a.name, a.description, a.maxProgress]
    );
  }
}

async function seedUserProfile(db: SQLite.SQLiteDatabase): Promise<void> {
  const result = await db.getFirstAsync<{ id: string }>(
    "SELECT id FROM user_profile WHERE id = 'singleton'"
  );
  if (result) return;

  await db.runAsync(
    "INSERT INTO user_profile (id) VALUES ('singleton')"
  );
}

export async function getUserProfile(db: SQLite.SQLiteDatabase): Promise<{
  personaParams: Record<string, number>;
  budgetLimits: Record<string, unknown>[];
  preferences: Record<string, unknown>;
}> {
  const row = await db.getFirstAsync<{
    persona_params: string;
    budget_limits: string;
    preferences: string;
  }>("SELECT persona_params, budget_limits, preferences FROM user_profile WHERE id = 'singleton'");

  return {
    personaParams: JSON.parse(row?.persona_params || '{"rigor":5,"humor":5,"proactivity":5}'),
    budgetLimits: JSON.parse(row?.budget_limits || '[]'),
    preferences: JSON.parse(row?.preferences || '{"currency":"CNY","language":"zh-Hans","theme":"dark","firstDayOfWeek":1}'),
  };
}

export async function writeAuditLog(
  db: SQLite.SQLiteDatabase,
  entry: {
    agent: string;
    tool: string;
    action: string;
    params?: Record<string, unknown>;
    resultStatus?: 'success' | 'error' | 'rejected' | 'timeout';
    userConfirmed?: boolean;
    errorCode?: string;
  }
): Promise<void> {
  const id = uuidv4();
  const now = new Date().toISOString();
  await db.runAsync(
    `INSERT INTO audit_log (id, timestamp, agent, tool, action, params, result_status, user_confirmed, error_code)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      now,
      entry.agent,
      entry.tool,
      entry.action,
      entry.params ? JSON.stringify(entry.params) : null,
      entry.resultStatus || 'success',
      entry.userConfirmed ? 1 : 0,
      entry.errorCode || null,
    ]
  );
}
