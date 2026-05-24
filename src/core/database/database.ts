import * as SQLite from 'expo-sqlite';

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
  `);

  await seedCategories(db);
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
