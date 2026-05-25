import type { BudgetPlan, SavingsGoal } from '../aggregates/BudgetPlan';

export interface BudgetRepository {
  loadPlan(): Promise<BudgetPlan>;
  savePlan(plan: BudgetPlan): Promise<void>;
}

export interface SavingsGoalRepository {
  save(goal: SavingsGoal): Promise<void>;
  findById(id: string): Promise<SavingsGoal | null>;
  findAll(): Promise<SavingsGoal[]>;
  delete(id: string): Promise<boolean>;
}
