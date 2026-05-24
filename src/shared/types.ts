export type BillType = 'income' | 'expense' | 'refund';
export type BillSource = 'manual' | 'import' | 'auto' | 'ocr';
export type MessageRole = 'user' | 'assistant' | 'system';
export type AgentId = 'master' | 'ledger' | 'analyst' | 'coach' | 'guardian';

export interface BillRecord {
  id: string;
  amount: number;
  type: BillType;
  category: string;
  tags: string[];
  merchant: string;
  rawDescription: string;
  date: string;
  note: string;
  source: BillSource;
  createdAt: string;
}

export interface ChatMessage {
  id: string;
  role: MessageRole;
  content: string;
  timestamp: string;
  data?: BillCardData | SummaryCardData;
}

export interface BillCardData {
  type: 'bill_card';
  bill: BillRecord;
}

export interface SummaryCardData {
  type: 'summary_card';
  totalIncome: number;
  totalExpense: number;
  billCount: number;
  period: string;
}

export interface AggregationResult {
  totalIncome: number;
  totalExpense: number;
  billCount: number;
  byCategory: Record<string, number>;
}

export interface IntentResult {
  intent: string;
  params: Record<string, unknown>;
  confidence: number;
}

export interface ToolResult {
  success: boolean;
  data?: unknown;
  error?: string;
  errorCode?: string;
}
