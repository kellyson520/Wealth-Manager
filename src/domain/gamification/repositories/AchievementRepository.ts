import type { Achievement } from '../aggregates/Achievement';

export interface AchievementRepository {
  save(achievement: Achievement): Promise<void>;
  findById(id: string): Promise<Achievement | null>;
  findAll(): Promise<Achievement[]>;
}
