jest.mock('../../../core/memory/adaptive-context', () => ({
  upsertUserProfileMemory: jest.fn().mockResolvedValue({
    id: 'pref_1',
    key: '沟通偏好',
    value: '回复简洁一点',
    confidence: 0.9,
  }),
}));

jest.mock('../../../core/memory/memory-engine', () => ({
  storeMemory: jest.fn().mockResolvedValue({ id: 'mem_1' }),
}));

import { upsertUserProfileMemory } from '../../../core/memory/adaptive-context';
import { storeMemory } from '../../../core/memory/memory-engine';
import {
  extractUserPreference,
  maybeStoreUserPreferenceFromText,
  recordToolProcedureMemory,
} from '../../../core/memory/memory-extractor';

describe('memory extractor', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('extracts explicit communication preference', () => {
    const result = extractUserPreference('请记住：以后回复简洁一点');

    expect(result).toEqual({
      key: '沟通偏好',
      value: '以后回复简洁一点',
      confidence: 0.9,
    });
  });

  test('skips sensitive preference candidates', () => {
    expect(extractUserPreference('请记住我的手机号 13800138000')).toBeNull();
    expect(extractUserPreference('请记住我的 api key 是 abc')).toBeNull();
  });

  test('stores extracted preference through adaptive context', async () => {
    const result = await maybeStoreUserPreferenceFromText('我偏好回答详细一点');

    expect(result?.key).toBe('沟通偏好');
    expect(upsertUserProfileMemory).toHaveBeenCalledWith(
      expect.objectContaining({
        key: '沟通偏好',
        source: 'user',
      })
    );
  });

  test('records sanitized tool procedure memory', async () => {
    await recordToolProcedureMemory({
      userText: '这个月少买盲盒',
      toolName: 'set_budget',
      args: { category: '娱乐', limit: 300, secret: 'nope' },
    });

    expect(storeMemory).toHaveBeenCalledWith(
      expect.objectContaining({
        layer: 'semantic',
        type: 'pattern',
        content: expect.stringContaining('set_budget'),
        metadata: expect.objectContaining({
          toolName: 'set_budget',
          args: { category: '娱乐' },
        }),
      })
    );
  });
});
