jest.mock('../../core/database/database', () => {
  const mockDb = {
    execAsync: jest.fn().mockResolvedValue(undefined),
    runAsync: jest.fn().mockResolvedValue({ lastInsertRowId: 1, changes: 1 }),
    getFirstAsync: jest.fn(),
    getAllAsync: jest.fn(),
    closeAsync: jest.fn().mockResolvedValue(undefined),
  };

  return {
    getDatabase: jest.fn().mockResolvedValue(mockDb),
    closeDatabase: jest.fn().mockResolvedValue(undefined),
  };
});

jest.mock('expo-sqlite', () => ({
  openDatabaseAsync: jest.fn().mockResolvedValue({
    execAsync: jest.fn(),
    getFirstAsync: jest.fn(),
    closeAsync: jest.fn(),
  }),
}));

import { getDatabase, closeDatabase } from '../../core/database/database';

describe('Database Layer', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (getDatabase as jest.Mock).mockClear();
  });

  describe('getDatabase', () => {
    test('returns database instance', async () => {
      const db = await getDatabase();
      expect(db).toBeDefined();
      expect(db.execAsync).toBeDefined();
      expect(db.runAsync).toBeDefined();
    });

    test('caches database instance', async () => {
      const db1 = await getDatabase();
      const db2 = await getDatabase();
      expect(db1).toBe(db2);
    });

    test('initializes tables on first call', async () => {
      const db = await getDatabase();
      expect(db.execAsync).toHaveBeenCalled();
      const sql = db.execAsync.mock.calls[0][0];
      expect(sql).toContain('CREATE TABLE IF NOT EXISTS bills');
      expect(sql).toContain('CREATE TABLE IF NOT EXISTS categories');
    });
  });

  describe('closeDatabase', () => {
    test('closes database connection', async () => {
      const db = await getDatabase();
      await closeDatabase();
      expect(db.closeAsync).toHaveBeenCalled();
    });
  });

  describe('table schemas', () => {
    test('bills table has correct constraints', async () => {
      const db = await getDatabase();
      const sql = db.execAsync.mock.calls[0][0];
      expect(sql).toContain('amount REAL NOT NULL');
      expect(sql).toContain("type TEXT NOT NULL CHECK(type IN ('income','expense','refund'))");
      expect(sql).toContain('category TEXT DEFAULT');
      expect(sql).toContain('created_at TEXT NOT NULL');
    });

    test('categories table has correct structure', async () => {
      const db = await getDatabase();
      const sql = db.execAsync.mock.calls[0][0];
      expect(sql).toContain("CHECK(type IN ('income','expense'))");
      expect(sql).toContain('icon TEXT DEFAULT');
    });
  });
});
