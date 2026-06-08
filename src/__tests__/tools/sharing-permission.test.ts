/**
 * Test for Fix #3: Permission bypass in sharing.tool.ts
 * Verifies that shared links enforce ownership - only the creator can
 * access or delete their shared links.
 */
jest.mock('../../core/database/database', () => {
  const mockDb = {
    execAsync: jest.fn().mockResolvedValue(undefined),
    runAsync: jest.fn().mockResolvedValue({ changes: 1 }),
    getFirstAsync: jest.fn(),
    getAllAsync: jest.fn().mockResolvedValue([
      {
        id: 'bill-1',
        merchant: '超市',
        amount: 150,
        date: '2026-06-01',
        category: '日用',
        type: 'expense',
      },
      {
        id: 'bill-2',
        merchant: '餐厅',
        amount: 88,
        date: '2026-06-02',
        category: '餐饮',
        type: 'expense',
      },
    ]),
  };

  return {
    getDatabase: jest.fn().mockResolvedValue(mockDb),
  };
});

import { initToolRegistry } from '../../agents/_shared/init-tools';
import { getTool } from '../../agents/_shared/tool-registry';
import { executeTool } from '../../tools/_pipeline/tool-executor';
import { create_link, leave_shared, delete_link } from '../../tools/sharing/sharing.tool';

describe('Sharing permission bypass fix (Fix #3)', () => {
  describe('create_link', () => {
    test('creates a link with ownerId tracking', async () => {
      const result = await create_link({
        ownerId: 'user-alice',
        startDate: '2026-06-01',
        endDate: '2026-06-30',
      });

      expect(result.success).toBe(true);
      expect(result.data).toHaveProperty('linkId');
      expect(result.data).toHaveProperty('token');
      expect((result.data as any).token).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    });
  });

  describe('leave_shared - ownership enforcement', () => {
    test('owner can access their own shared link', async () => {
      const createResult = await create_link({
        ownerId: 'user-alice',
        startDate: '2026-06-01',
        endDate: '2026-06-30',
      });
      expect(createResult.success).toBe(true);

      const token = (createResult.data as any).token;
      const accessResult = await leave_shared({
        token,
        callerId: 'user-alice',
      });

      expect(accessResult.success).toBe(true);
      expect(accessResult.data).toHaveProperty('bills');
    });

    test('non-owner CANNOT access shared link (permission denied)', async () => {
      const createResult = await create_link({
        ownerId: 'user-alice',
        startDate: '2026-06-01',
        endDate: '2026-06-30',
      });
      expect(createResult.success).toBe(true);

      const token = (createResult.data as any).token;
      const accessResult = await leave_shared({
        token,
        callerId: 'user-bob', // Different user trying to access
      });

      expect(accessResult.success).toBe(false);
      expect(accessResult.error).toContain('无权访问');
      expect(accessResult.errorCode).toBe('PERMISSION_DENIED');
    });

    test('invalid token is rejected', async () => {
      const result = await leave_shared({
        token: 'nonexistent-token',
        callerId: 'user-alice',
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('无效的分享令牌');
    });
  });

  describe('executor identity enforcement', () => {
    test('uses executor agentId instead of caller-supplied owner fields', async () => {
      initToolRegistry();
      const createTool = getTool('create_link')!;
      const leaveTool = getTool('leave_shared')!;

      const createResult = await executeTool(
        createTool,
        { ownerId: 'coach', startDate: '2026-06-01', endDate: '2026-06-30' },
        { agentId: 'guardian' }
      );
      expect(createResult.success).toBe(true);

      const token = (createResult.data as any).token;
      const accessResult = await executeTool(
        leaveTool,
        { token, callerId: 'guardian' },
        { agentId: 'coach' }
      );

      expect(accessResult.success).toBe(false);
      expect(accessResult.errorCode).toBe('PERMISSION_DENIED');
    });
  });

  describe('delete_link - ownership enforcement', () => {
    test('owner can delete their own link', async () => {
      const createResult = await create_link({
        ownerId: 'user-alice',
        startDate: '2026-06-01',
        endDate: '2026-06-30',
      });
      expect(createResult.success).toBe(true);

      const linkId = (createResult.data as any).linkId;
      const deleteResult = await delete_link({
        linkId,
        callerId: 'user-alice',
      });

      expect(deleteResult.success).toBe(true);
      expect((deleteResult.data as any).deleted).toBe(true);
    });

    test('non-owner CANNOT delete shared link (permission denied)', async () => {
      const createResult = await create_link({
        ownerId: 'user-alice',
        startDate: '2026-06-01',
        endDate: '2026-06-30',
      });
      expect(createResult.success).toBe(true);

      const linkId = (createResult.data as any).linkId;
      const deleteResult = await delete_link({
        linkId,
        callerId: 'user-bob', // Different user trying to delete
      });

      expect(deleteResult.success).toBe(false);
      expect(deleteResult.error).toContain('无权访问');
      expect(deleteResult.errorCode).toBe('PERMISSION_DENIED');
    });

    test('after owner deletes, link is gone for everyone', async () => {
      const createResult = await create_link({
        ownerId: 'user-alice',
        startDate: '2026-06-01',
        endDate: '2026-06-30',
      });

      const linkId = (createResult.data as any).linkId;

      // Owner deletes
      await delete_link({ linkId, callerId: 'user-alice' });

      // Any access should fail (link no longer exists)
      const token = (createResult.data as any).token;
      const accessResult = await leave_shared({ token, callerId: 'user-alice' });
      expect(accessResult.success).toBe(false);
    });
  });
});
