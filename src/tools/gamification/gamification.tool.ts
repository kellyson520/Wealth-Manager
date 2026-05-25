import { captureError } from '../../core/logger/logger';
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
    captureError('GamificationTool.get_streak_info', e, 'Get streak info failed');
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
    captureError('GamificationTool.get_achievement', e, 'Get achievement failed');
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
    captureError('GamificationTool.update_achievement_progress', e, 'Update achievement progress failed');
    return { success: false, error: '更新成就失败', errorCode: '1000' };
  }
}

export async function get_level(): Promise<ToolResult> {
  try {
    const db = await getDatabase();
    const result = await db.getFirstAsync<{ count: number }>(
      'SELECT COUNT(*) as count FROM bills'
    );
    const billCount = result?.count || 0;

    const achievementResult = await db.getAllAsync<{ unlocked: number }>(
      'SELECT unlocked FROM achievements'
    );
    const unlockedCount = achievementResult.filter((a) => a.unlocked).length;

    const streakRows = await db.getAllAsync<{ date: string }>(
      "SELECT date FROM bills WHERE date IS NOT NULL GROUP BY date ORDER BY date DESC LIMIT 100"
    );
    const dates = streakRows.map((r) => r.date);
    let streak = 0;
    const today = new Date().toISOString().split('T')[0];
    let check = new Date(today);
    while (dates.includes(check.toISOString().split('T')[0])) {
      streak++;
      check.setDate(check.getDate() - 1);
    }

    let level = 1;
    let title = '记账新手';
    const exp = billCount + unlockedCount * 50 + streak * 10;

    if (exp >= 10) { level = 2; title = '小小管家'; }
    if (exp >= 50) { level = 3; title = '理财能手'; }
    if (exp >= 100) { level = 4; title = '财务达人'; }
    if (exp >= 300) { level = 5; title = '资深玩家'; }
    if (exp >= 500) { level = 6; title = '财富大师'; }
    if (exp >= 1000) { level = 7; title = '记账王者'; }
    if (exp >= 2000) { level = 8; title = '传奇富翁'; }

    const nextLevelExp = level === 1 ? 10 : level === 2 ? 50 : level === 3 ? 100 : level === 4 ? 300 : level === 5 ? 500 : level === 6 ? 1000 : level === 7 ? 2000 : 5000;

    return {
      success: true,
      data: {
        level,
        title,
        experience: exp,
        nextLevelExperience: nextLevelExp,
        progress: Math.min(1, exp / nextLevelExp),
        stats: { billCount, unlockedAchievements: unlockedCount, currentStreak: streak },
      },
    };
  } catch (e) {
    captureError('GamificationTool.get_level', e, 'Failed to get level');
    return { success: false, error: '获取等级失败', errorCode: '1000' };
  }
}

export async function get_challenges(): Promise<ToolResult> {
  try {
    const db = await getDatabase();
    const now = new Date();
    const today = now.toISOString().split('T')[0];
    const monthStart = `${now.getFullYear()}-${(now.getMonth() + 1).toString().padStart(2, '0')}-01`;

    const todayBills = await db.getFirstAsync<{ count: number }>(
      "SELECT COUNT(*) as count FROM bills WHERE date = ?", [today]
    );

    const monthExpense = await db.getFirstAsync<{ total: number }>(
      "SELECT COALESCE(SUM(amount), 0) as total FROM bills WHERE type = 'expense' AND date >= ?",
      [monthStart]
    );

    const achievements = await db.getAllAsync<{ unlocked: number }>(
      'SELECT unlocked FROM achievements'
    );
    const unlockedCount = achievements.filter((a) => a.unlocked).length;

    const challenges = [
      {
        id: 'daily_record',
        title: '今日打卡',
        description: '今天记录至少1笔账单',
        current: todayBills?.count || 0,
        target: 1,
        completed: (todayBills?.count || 0) >= 1,
        reward: '+10 经验',
      },
      {
        id: 'three_day_streak',
        title: '三天连续',
        description: '连续3天都记账',
        current: 0,
        target: 3,
        completed: false,
        reward: '+30 经验',
      },
      {
        id: 'under_budget',
        title: '月度预算守门员',
        description: '本月总支出控制在一定范围内',
        current: monthExpense?.total || 0,
        target: 5000,
        completed: (monthExpense?.total || 0) <= 5000,
        reward: '+50 经验',
      },
      {
        id: 'achievement_hunter',
        title: '成就猎人',
        description: `解锁更多成就 (${unlockedCount}/9)`,
        current: unlockedCount,
        target: 5,
        completed: unlockedCount >= 5,
        reward: '+100 经验',
      },
      {
        id: 'variety_spender',
        title: '分类多样化',
        description: '本月在5个以上不同分类有消费',
        current: 0,
        target: 5,
        completed: false,
        reward: '+40 经验',
      },
    ];

    return { success: true, data: challenges };
  } catch (e) {
    captureError('GamificationTool.get_challenges', e, 'Failed to get challenges');
    return { success: false, error: '获取挑战失败', errorCode: '1000' };
  }
}
