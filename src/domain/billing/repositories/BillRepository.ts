import type { Bill } from '../aggregates/Bill';
import type { BillSearchCriteria, AggregationResultDTO } from '../types';

export interface BillRepository {
  save(bill: Bill): Promise<void>;
  findById(id: string): Promise<Bill | null>;
  search(criteria: BillSearchCriteria): Promise<Bill[]>;
  findByDateRange(startDate: string, endDate: string): Promise<Bill[]>;
  aggregate(period: 'today' | 'week' | 'month'): Promise<AggregationResultDTO>;
  delete(id: string): Promise<boolean>;

  getCategoryTotals(startDate: string, type: 'income' | 'expense'): Promise<Record<string, number>>;
  getMonthlyComparison(months: number): Promise<{ month: string; income: number; expense: number }[]>;
  getMerchantRanking(startDate: string, limit: number): Promise<{ merchant: string; totalAmount: number; count: number }[]>;
  getDailyExpenses(startDate: string): Promise<{ date: string; total: number }[]>;
  getDistinctCategories(): Promise<string[]>;
}

export const BILL_REPOSITORY = Symbol('BillRepository');
