import { getDatabase } from '../../core/database/database';
import { Achievement, StreakInfo, ToolResult } from '../../shared/types';

export async function get_streak_info(): Promise<ToolResult> {
  const db = await getDatabase();

  try {
    const rows = await db.getAllAsync<{ date: string }>(
      "SELECT date FROM bills WHERE date IS NOT NULL GROUP BY date ORDER BY date DESC"
    );

    const dates = rows.map(r => r.date);
    let currentStreak = 0;
    let longestStreak = 0;
    let tempStreak = 0;

    const today = new Date().toISOString().split('T')[0];
    const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];

    const hasToday = dates.includes(today);
    const hasYesterday = dates.includes(yesterday);

    if (hasToday || hasYesterday) {
      let checkDate = hasToday ? new Date(today) : new Date(yesterday);
      while (dates.includes(checkDate.toISOString().split('T')[0])) {
        currentStreak++;
        checkDate.setDate(checkDate.getDate() - 1);
      }
    }

    let prevDate: Date | null = null;
    for (const d of [...dates].sort()) {
      const curDate = new Date(d);
      if (prevDate) {
        const diff = (curDate.getTime() - prevDate.getTime()) / 86400000;
        if (diff <= 1) {
          tempStreak++;
        } else {
          tempStreak = 1;
        }
      } else {
        tempStreak = 1;
      }
      if (tempStreak > longestStreak) {
        longestStreak = tempStreak;
      }
      prevDate = curDate;
    }

    const streak: StreakInfo = {
      currentStreak,
      longestStreak,
      totalDays: dates.length,
      lastRecordDate: rows[0]?.date || '',
    };

    return { success: true, data: streak };
  } catch (e) {
    return { success: false, error: '查询打卡信息失败', errorCode: '1000' };
  }
}

export async function get_achievement(params: {
  achievementId?: string;
}): Promise<ToolResult> {
  const db = await getDatabase();

  try {
    if (params.achievementId) {
      const ach = await db.getFirstAsync<Achievement>(
        'SELECT * FROM achievements WHERE id = ?',
        [params.achievementId]
      );
      return { success: true, data: ach ? [ach] : [] };
    }

    const achievements = await db.getAllAsync<Achievement>(
      'SELECT * FROM achievements ORDER BY unlocked DESC, name ASC'
    );

    const billCount = await db.getFirstAsync<{ count: number }>(
      'SELECT COUNT(*) as count FROM bills'
    );
    const streakResult = await get_streak_info();
    const streak = streakResult.data as StreakInfo | undefined;

    for (const ach of achievements) {
      switch (ach.id) {
        case 'ach_first_bill':
          ach.progress = billCount ? Math.min(billCount.count, 1) : 0;
          break;
        case 'ach_100_bills':
        case 'ach_1000_bills':
          ach.progress = billCount?.count || 0;
          break;
        case 'ach_7day_streak':
        case 'ach_30day_streak':
          ach.progress = streak?.longestStreak || 0;
          break;
      }
      if (ach.progress >= ach.maxProgress && !ach.unlocked) {
        ach.unlocked = true;
        ach.unlockedAt = ach.unlockedAt || new Date().toISOString();
      }
    }

    return { success: true, data: achievements };
  } catch (e) {
    return { success: false, error: '查询成就失败', errorCode: '1000' };
  }
}

export async function update_achievement_progress(params: {
  achievementId: string;
  progress: number;
}): Promise<ToolResult> {
  const db = await getDatabase();

  try {
    const ach = await db.getFirstAsync<{
      id: string; progress: number; max_progress: number; unlocked: number;
      name: string;
    }>(
      'SELECT * FROM achievements WHERE id = ?',
      [params.achievementId]
    );

    if (!ach) {
      return { success: false, error: '成就不存在', errorCode: '1001' };
    }

    const newProgress = Math.min(params.progress, ach.max_progress);
    const unlocked = newProgress >= ach.max_progress;
    const unlockedAt = unlocked ? new Date().toISOString() : null;

    await db.runAsync(
      'UPDATE achievements SET progress = ?, unlocked = ?, unlocked_at = ? WHERE id = ?',
      [newProgress, unlocked ? 1 : 0, unlockedAt, params.achievementId]
    );

    return { success: true, data: { name: ach.name, unlocked, progress: newProgress } };
  } catch (e) {
    return { success: false, error: '更新成就失败', errorCode: '1000' };
  }
}
