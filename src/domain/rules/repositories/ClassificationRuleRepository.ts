import type { ClassificationRule } from '../aggregates/ClassificationRule';

export interface ClassificationRuleRepository {
  save(rule: ClassificationRule): Promise<void>;
  findById(id: string): Promise<ClassificationRule | null>;
  search(params: { keyword?: string; enabled?: boolean; limit?: number; offset?: number }): Promise<ClassificationRule[]>;
  delete(id: string): Promise<boolean>;
}
