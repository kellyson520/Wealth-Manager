/**
 * Test for Fix #18: expo-sqlite does NOT support SQLCipher.
 * The `key` option is intentionally removed to avoid false sense of security.
 * Sensitive data must use application-layer encryption (sync-crypto.ts).
 */

const mockExecAsync = jest.fn().mockResolvedValue(undefined);
const mockRunAsync = jest.fn().mockResolvedValue({ changes: 1 });
const mockGetFirstAsync = jest.fn();
const mockGetAllAsync = jest.fn().mockResolvedValue([]);

const mockDb = {
  execAsync: mockExecAsync,
  runAsync: mockRunAsync,
  getFirstAsync: mockGetFirstAsync,
  getAllAsync: mockGetAllAsync,
};

jest.mock('expo-sqlite', () => ({
  openDatabaseAsync: jest.fn().mockResolvedValue(mockDb),
}));

jest.mock('../../core/rules', () => ({
  initRulesTable: jest.fn().mockResolvedValue(undefined),
}));

let database: typeof import('../../core/database/database');

describe('Database encryption (Fix #18)', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    jest.resetModules();
    jest.mock('expo-sqlite', () => ({
      openDatabaseAsync: jest.fn().mockResolvedValue(mockDb),
    }));
    jest.mock('../../core/rules', () => ({
      initRulesTable: jest.fn().mockResolvedValue(undefined),
    }));
    database = require('../../core/database/database');
  });

  test('openDatabaseAsync is called WITHOUT key option (expo-sqlite ignores it)', async () => {
    await database.getDatabase();
    const openFn = require('expo-sqlite').openDatabaseAsync;

    // Should be called with just the database name, no key option
    expect(openFn).toHaveBeenCalledWith('wealth_manager.db');
    expect(openFn).not.toHaveBeenCalledWith(
      'wealth_manager.db',
      expect.objectContaining({ key: expect.any(String) })
    );
  });

  test('no PRAGMA key is issued', async () => {
    await database.getDatabase();
    const pragmaCalls = mockExecAsync.mock.calls.filter(
      (call: any[]) => typeof call[0] === 'string' && call[0].toUpperCase().includes('PRAGMA KEY')
    );
    expect(pragmaCalls).toHaveLength(0);
  });

  test('PRAGMA foreign_keys is still set', async () => {
    await database.getDatabase();
    expect(mockExecAsync).toHaveBeenCalledWith('PRAGMA foreign_keys = ON');
  });
});
