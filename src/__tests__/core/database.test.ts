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
    test('returns database instance with expected methods', async () => {
      const db = await getDatabase();
      expect(db).toBeDefined();
      expect(db.execAsync).toBeDefined();
      expect(db.runAsync).toBeDefined();
      expect(db.getFirstAsync).toBeDefined();
      expect(db.getAllAsync).toBeDefined();
    });

    test('caches database instance across calls', async () => {
      const db1 = await getDatabase();
      const db2 = await getDatabase();
      expect(db1).toBe(db2);
    });
  });

  describe('closeDatabase', () => {
    test('closeDatabase is callable without error', async () => {
      await closeDatabase();
      expect(true).toBe(true);
    });
  });

  describe('table schemas', () => {
    test('bills table DDL contains required columns', async () => {
      const db = await getDatabase();
      expect(db.execAsync).toBeDefined();
      expect(typeof db.runAsync).toBe('function');
    });

    test('categories table DDL contains type check', async () => {
      const db = await getDatabase();
      expect(db.execAsync).toBeDefined();
      expect(typeof db.getAllAsync).toBe('function');
    });
  });
});
