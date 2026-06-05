import { shouldExecuteNow } from '../../tools/automation/task-scheduler';
import { RecurringTask } from '../../shared/types';

function task(overrides: Partial<RecurringTask>): RecurringTask {
  return {
    id: 'task-1',
    name: '测试提醒',
    type: 'reminder',
    cron: '0 20 * * *',
    enabled: true,
    createdAt: '2026-06-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('task scheduler cron matching', () => {
  test('does not execute a new valid cron task outside its scheduled time', () => {
    const now = new Date(2026, 5, 5, 7, 30);
    expect(shouldExecuteNow(task({ cron: '30 8 * * 1-5' }), now)).toBe(false);
  });

  test('executes weekday cron at the scheduled weekday time', () => {
    const now = new Date(2026, 5, 5, 8, 30);
    expect(shouldExecuteNow(task({ cron: '30 8 * * 1-5' }), now)).toBe(true);
  });

  test('skips weekday cron on weekends', () => {
    const now = new Date(2026, 5, 6, 8, 30);
    expect(shouldExecuteNow(task({ cron: '30 8 * * 1-5' }), now)).toBe(false);
  });

  test('does not run a daily task twice on the same day', () => {
    const now = new Date(2026, 5, 5, 8, 30);
    expect(
      shouldExecuteNow(task({
        cron: '30 8 * * 1-5',
        lastTriggered: '2026-06-05T08:30:00.000Z',
      }), now)
    ).toBe(false);
  });
});
