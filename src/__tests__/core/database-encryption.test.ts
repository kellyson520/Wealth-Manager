/**
 * Test for Fix #1: Database encryption uses proper expo-sqlite key option
 * instead of ineffective PRAGMA key.
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

const SQLite = require('expo-sqlite');

// We need to reset the singleton before each test
let database: typeof import('../../core/database/database');

describe('Database encryption (Fix #1)', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    // Force re-require to reset the singleton
    jest.resetModules();
    jest.mock('expo-sqlite', () => ({
      openDatabaseAsync: jest.fn().mockResolvedValue(mockDb),
    }));
    jest.mock('../../core/rules', () => ({
      initRulesTable: jest.fn().mockResolvedValue(undefined),
    }));
    database = require('../../core/database/database');
  });

  test('openDatabaseAsync is called with { key } option instead of PRAGMA key', async () => {
    await database.getDatabase();
    const openFn = require('expo-sqlite').openDatabaseAsync;

    expect(openFn).toHaveBeenCalledWith(
      'wealth_manager.db',
      expect.objectContaining({ key: expect.any(String) })
    );
  });

  test('key option is a non-empty string', async () => {
    await database.getDatabase();
    const openFn = require('expo-sqlite').openDatabaseAsync;

    const callArgs = openFn.mock.calls[0];
    const options = callArgs[1];
    expect(options).toBeDefined();
    expect(options.key).toBeDefined();
    expect(typeof options.key).toBe('string');
    expect(options.key.length).toBeGreaterThan(0);
  });

  test('no PRAGMA key is issued (encryption handled by openDatabaseAsync options)', async () => {
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

  test('encryption key comes from EXPO_PUBLIC_WEALTH_MANAGER_DB_KEY env var', async () => {
    process.env.EXPO_PUBLIC_WEALTH_MANAGER_DB_KEY = 'test-secret-key-12345';

    // Re-require with updated env
    jest.resetModules();
    jest.mock('expo-sqlite', () => ({
      openDatabaseAsync: jest.fn().mockResolvedValue(mockDb),
    }));
    jest.mock('../../core/rules', () => ({
      initRulesTable: jest.fn().mockResolvedValue(undefined),
    }));
    const db2 = require('../../core/database/database');
    await db2.getDatabase();

    const openFn = require('expo-sqlite').openDatabaseAsync;
    const callArgs = openFn.mock.calls[0];
    expect(callArgs[1].key).toBe('test-secret-key-12345');

    delete process.env.EXPO_PUBLIC_WEALTH_MANAGER_DB_KEY;
  });
});
