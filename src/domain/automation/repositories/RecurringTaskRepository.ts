import type { RecurringTask } from '../aggregates/RecurringTask';

export interface RecurringTaskRepository {
  save(task: RecurringTask): Promise<void>;
  findById(id: string): Promise<RecurringTask | null>;
  findAll(): Promise<RecurringTask[]>;
  delete(id: string): Promise<boolean>;
}
