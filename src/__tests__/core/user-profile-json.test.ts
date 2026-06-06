import { getUserProfile } from '../../core/database/database';

describe('user profile JSON parsing', () => {
  test('falls back to defaults when stored profile JSON is malformed or has the wrong shape', async () => {
    const db = {
      getFirstAsync: jest.fn().mockResolvedValue({
        persona_params: '{bad-json',
        budget_limits: '{"category":"餐饮"}',
        preferences: 'null',
      }),
    };

    const profile = await getUserProfile(db as any);

    expect(profile.personaParams).toEqual({ rigor: 5, humor: 5, proactivity: 5 });
    expect(profile.budgetLimits).toEqual([]);
    expect(profile.preferences).toEqual({
      currency: 'CNY',
      language: 'zh-Hans',
      theme: 'dark',
      firstDayOfWeek: 1,
    });
  });
});
