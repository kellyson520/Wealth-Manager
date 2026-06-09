jest.mock('../../core/database/database', () => {
  const mockDb = {
    runAsync: jest.fn(),
  };

  return {
    getDatabase: jest.fn().mockResolvedValue(mockDb),
  };
});

jest.mock('../../core/logger/logger', () => ({
  captureError: jest.fn(),
}));

import { update_reimbursement_status } from '../../tools/reimbursement/reimbursement.tool';
import { getDatabase } from '../../core/database/database';

async function getMockDb() {
  return getDatabase() as any;
}

describe('update_reimbursement_status', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('rejects status updates for missing reimbursement tasks', async () => {
    const mockDb = await getMockDb();
    mockDb.runAsync.mockResolvedValue({ changes: 0 });

    const result = await update_reimbursement_status({ taskId: 'missing-task', status: 'approved' });

    expect(result.success).toBe(false);
    expect(result.error).toBe('报销任务不存在');
  });
});
