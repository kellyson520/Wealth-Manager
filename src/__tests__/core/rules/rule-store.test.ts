const mockDb = {
  getAllAsync: jest.fn(),
};

jest.mock('../../../core/database/database', () => ({
  getDatabase: jest.fn(),
}));

import { getDatabase } from '../../../core/database/database';
import { searchRules } from '../../../core/rules/rule-store';

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
