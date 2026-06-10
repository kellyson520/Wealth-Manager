import * as SQLite from 'expo-sqlite';
import { v4 as uuidv4 } from 'uuid';
import { initRulesTable } from '../rules';

let db: SQLite.SQLiteDatabase | null = null;

export async function getDatabase(): Promise<SQLite.SQLiteDatabase> {
  if (db) return db;
  const key = getDatabaseKey();
  db = await SQLite.openDatabaseAsync('wealth_manager.db', { key } as SQLite.SQLiteOpenOptions & { key: string });
  await configureDatabaseSecurity(db);
  await initTables(db);
  return db;
}

async function configureDatabaseSecurity(db: SQLite.SQLiteDatabase): Promise<void> {
  await db.execAsync('PRAGMA foreign_keys = ON');
}

function getDatabaseKey(): string {
  const env = (globalThis as unknown as {
    process?: { env?: Record<string, string | undefined> };
  }).process?.env;
  return env?.EXPO_PUBLIC_WEALTH_MANAGER_DB_KEY || 'development-only-wealth-manager-db-key';
}

function parseJsonOrDefault<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
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
      created_at TEXT NOT NULL,
      hash TEXT DEFAULT '',
      prev_hash TEXT DEFAULT ''
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
	      params_hash TEXT,
	      result_status TEXT DEFAULT 'success',
	      user_confirmed INTEGER DEFAULT 0,
	      error_code TEXT,
	      permission_level INTEGER DEFAULT 0,
	      duration_ms INTEGER,
	      ttl_days INTEGER DEFAULT 365,
	      hash TEXT DEFAULT '',
	      prev_hash TEXT DEFAULT ''
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

    CREATE TABLE IF NOT EXISTS sync_state (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS memory_engine (
      id TEXT PRIMARY KEY,
      layer TEXT NOT NULL CHECK(layer IN ('working','episodic','long_term','semantic')),
      type TEXT NOT NULL DEFAULT 'fact',
      agent_id TEXT NOT NULL,
      content TEXT NOT NULL,
      metadata TEXT DEFAULT '{}',
      importance REAL DEFAULT 0.5,
      access_count INTEGER DEFAULT 0,
      last_accessed_at TEXT,
      created_at TEXT NOT NULL,
      expires_at TEXT,
      tags TEXT DEFAULT '[]'
    );

    CREATE TABLE IF NOT EXISTS vector_store (
      id TEXT PRIMARY KEY,
      embedding TEXT NOT NULL,
      metadata TEXT DEFAULT '{}',
      source_type TEXT DEFAULT 'memory',
      source_id TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS correction_log (
      id TEXT PRIMARY KEY,
      bill_id TEXT NOT NULL,
      merchant TEXT NOT NULL,
      original_category TEXT NOT NULL,
      corrected_category TEXT NOT NULL,
      corrected_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS nlu_learning_samples (
      id TEXT PRIMARY KEY,
      phrase TEXT NOT NULL,
      normalized_text TEXT NOT NULL,
      intent TEXT NOT NULL,
      agent TEXT NOT NULL,
      params TEXT DEFAULT '{}',
      source TEXT DEFAULT 'cloud_function',
      confidence REAL DEFAULT 0.82,
      hits INTEGER DEFAULT 1,
      enabled INTEGER DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(normalized_text, intent)
    );

    CREATE TABLE IF NOT EXISTS nlu_learning_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS persona_snapshots (
      id TEXT PRIMARY KEY,
      version INTEGER NOT NULL DEFAULT 1,
      soul TEXT NOT NULL,
      tone_rules TEXT DEFAULT '[]',
      boundaries TEXT DEFAULT '[]',
      source TEXT DEFAULT 'system',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS user_profile_memory (
      id TEXT PRIMARY KEY,
      key TEXT NOT NULL UNIQUE,
      value TEXT NOT NULL,
      confidence REAL DEFAULT 0.7,
      source TEXT DEFAULT 'agent',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS agent_memory_digest (
      id TEXT PRIMARY KEY,
      agent_id TEXT NOT NULL,
      digest TEXT NOT NULL,
      token_budget INTEGER DEFAULT 1000,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);

  await db.execAsync(`CREATE INDEX IF NOT EXISTS idx_vector_source ON vector_store(source_type, source_id)`);
  await db.execAsync(`CREATE INDEX IF NOT EXISTS idx_nlu_learning_lookup ON nlu_learning_samples(normalized_text, enabled, hits)`);
  await db.execAsync(`CREATE INDEX IF NOT EXISTS idx_agent_memory_digest_agent ON agent_memory_digest(agent_id, updated_at)`);

  // Core table indexes for query performance
  await db.execAsync(`CREATE INDEX IF NOT EXISTS idx_audit_log_timestamp ON audit_log(timestamp)`);
  await db.execAsync(`CREATE INDEX IF NOT EXISTS idx_audit_log_action ON audit_log(action)`);
  await db.execAsync(`CREATE INDEX IF NOT EXISTS idx_bills_date ON bills(date)`);
  await db.execAsync(`CREATE INDEX IF NOT EXISTS idx_bills_category ON bills(category)`);
  await db.execAsync(`CREATE INDEX IF NOT EXISTS idx_debts_status ON debts(status)`);
  await db.execAsync(`CREATE INDEX IF NOT EXISTS idx_debts_due_date ON debts(due_date)`);
  await migrateAuditLog(db);

  await initRulesTable();

  await seedCategories(db);
  await seedAchievements(db);
  await seedUserProfile(db);
}

async function migrateAuditLog(db: SQLite.SQLiteDatabase): Promise<void> {
  const migrations = [
    `ALTER TABLE audit_log ADD COLUMN params_hash TEXT`,
    `ALTER TABLE audit_log ADD COLUMN permission_level INTEGER DEFAULT 0`,
    `ALTER TABLE audit_log ADD COLUMN duration_ms INTEGER`,
    `ALTER TABLE audit_log ADD COLUMN hash TEXT DEFAULT ''`,
    `ALTER TABLE audit_log ADD COLUMN prev_hash TEXT DEFAULT ''`,
  ];

  for (const statement of migrations) {
    try {
      await db.execAsync(statement);
    } catch {
      // Column already exists on newer databases.
    }
  }
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
    personaParams: parseJsonOrDefault(row?.persona_params, { rigor: 5, humor: 5, proactivity: 5 }),
    budgetLimits: parseJsonOrDefault(row?.budget_limits, []),
    preferences: parseJsonOrDefault(row?.preferences, { currency: 'CNY', language: 'zh-Hans', theme: 'dark', firstDayOfWeek: 1 }),
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
    permissionLevel?: number;
    durationMs?: number;
  }
): Promise<void> {
  const id = uuidv4();
  const now = new Date().toISOString();
  const paramsHash = entry.params ? await hashParams(entry.params) : null;

  const prevRow = await db.getFirstAsync<{ hash: string }>(
    `SELECT hash FROM audit_log ORDER BY timestamp DESC, id DESC LIMIT 1`
  );
  const prevHash = prevRow?.hash || '';

  const entryHash = await computeAuditEntryHash({
    id,
    timestamp: now,
    agent: entry.agent,
    tool: entry.tool,
    action: entry.action,
    params_hash: paramsHash || '',
    result_status: entry.resultStatus || 'success',
    prev_hash: prevHash,
  });

  await db.runAsync(
    `INSERT INTO audit_log (id, timestamp, agent, tool, action, params, params_hash, result_status, user_confirmed, error_code, permission_level, duration_ms, hash, prev_hash)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      now,
      entry.agent,
      entry.tool,
      entry.action,
      entry.params ? stableStringify(entry.params) : null,
      paramsHash,
      entry.resultStatus || 'success',
      entry.userConfirmed ? 1 : 0,
      entry.errorCode || null,
      entry.permissionLevel ?? 0,
      entry.durationMs ?? null,
      entryHash,
      prevHash,
    ]
  );
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const obj = value as Record<string, unknown>;
  return `{${Object.keys(obj).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(obj[key])}`).join(',')}}`;
}

async function hashParams(params: Record<string, unknown>): Promise<string> {
  const input = stableStringify(params);
  const webCrypto = getWebCryptoForHashing();
  const secret = getHashSecret();
  const key = await webCrypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await webCrypto.subtle.sign('HMAC', key, new TextEncoder().encode(input));
  return Array.from(new Uint8Array(signature)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function computeAuditEntryHash(entry: {
  id: string;
  timestamp: string;
  agent: string;
  tool: string;
  action: string;
  params_hash: string;
  result_status: string;
  prev_hash: string;
}): Promise<string> {
  const payload = stableStringify({
    id: entry.id,
    timestamp: entry.timestamp,
    agent: entry.agent,
    tool: entry.tool,
    action: entry.action,
    params_hash: entry.params_hash,
    result_status: entry.result_status,
    prev_hash: entry.prev_hash,
  });
  const webCrypto = getWebCryptoForHashing();
  const secret = getHashSecret();
  const key = await webCrypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await webCrypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload));
  return Array.from(new Uint8Array(signature)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

function getWebCryptoForHashing(): Crypto {
  if (typeof globalThis.crypto?.subtle !== 'undefined') {
    return globalThis.crypto;
  }
  const nodeRequire = (globalThis as unknown as { require?: (moduleName: string) => unknown }).require;
  const nodeCrypto = nodeRequire?.('crypto') as { webcrypto?: Crypto } | undefined;
  if (nodeCrypto?.webcrypto?.subtle) {
    return nodeCrypto.webcrypto;
  }
  throw new Error('WebCrypto unavailable');
}

function getHashSecret(): string {
  const env = (globalThis as unknown as {
    process?: { env?: Record<string, string | undefined> };
  }).process?.env;
  return env?.WEALTH_MANAGER_HASHCHAIN_KEY || env?.EXPO_PUBLIC_WEALTH_MANAGER_HASHCHAIN_KEY || 'development-only-wealth-manager-hashchain-key';
}
