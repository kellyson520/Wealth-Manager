const mockDb = {
  getAllAsync: jest.fn(),
  runAsync: jest.fn(),
};

jest.mock('../../../core/database/database', () => ({
  getDatabase: jest.fn(),
}));

import { getDatabase } from '../../../core/database/database';
import { deleteRule, searchRules, updateRule } from '../../../core/rules/rule-store';

describe('rule-store searchRules', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (getDatabase as jest.Mock).mockResolvedValue(mockDb);
    mockDb.getAllAsync.mockResolvedValue([]);
  });

  test('clamps negative pagination values', async () => {
    await searchRules({ limit: -1, offset: -5 });

    expect(mockDb.getAllAsync).toHaveBeenCalledWith(
      expect.stringContaining('LIMIT ? OFFSET ?'),
      [1, 0]
    );
  });
});

describe('rule-store mutations', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (getDatabase as jest.Mock).mockResolvedValue(mockDb);
  });

  test('returns false when updating a missing rule', async () => {
    mockDb.runAsync.mockResolvedValue({ changes: 0 });

    await expect(updateRule('missing-rule', { enabled: false })).resolves.toBe(false);
  });

  test('returns false when deleting a missing rule', async () => {
    mockDb.runAsync.mockResolvedValue({ changes: 0 });

    await expect(deleteRule('missing-rule')).resolves.toBe(false);
  });
});
