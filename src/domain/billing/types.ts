export type BillType = 'income' | 'expense' | 'refund';
export type BillSource = 'manual' | 'import' | 'auto' | 'ocr';

export interface BillProps {
  id: string;
  amount: number;
  type: BillType;
  category: string;
  merchant: string;
  date: string;
  note: string;
  source: BillSource;
  tags: string[];
  createdAt: string;
}

export interface RecordBillCommand {
  amount: number;
  type: BillType;
  merchant: string;
  category?: string;
  date?: string;
  note?: string;
  source?: BillSource;
}

export interface BillSearchCriteria {
  keyword?: string;
  startDate?: string;
  endDate?: string;
  category?: string;
  type?: BillType;
  tags?: string[];
  limit?: number;
  offset?: number;
}

export interface AggregationResultDTO {
  totalIncome: number;
  totalExpense: number;
  billCount: number;
  byCategory: Record<string, number>;
}
