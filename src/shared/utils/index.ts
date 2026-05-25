import { v4 as uuidv4 } from 'uuid';

export function generateId(prefix: string = ''): string {
  const id = uuidv4();
  return prefix ? `${prefix}_${id}` : id;
}

export function formatCurrency(amount: number, currency: string = 'CNY'): string {
  if (currency === 'CNY') {
    return `¥${amount.toFixed(2)}`;
  }
  return `${amount.toFixed(2)} ${currency}`;
}

export function formatDate(dateStr: string): string {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  const y = d.getFullYear();
  const m = (d.getMonth() + 1).toString().padStart(2, '0');
  const day = d.getDate().toString().padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function formatDateTime(dateStr: string): string {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  return `${formatDate(dateStr)} ${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
}

export function todayISO(): string {
  return new Date().toISOString().split('T')[0];
}

export function nowISO(): string {
  return new Date().toISOString();
}

export function daysAgo(n: number): string {
  const d = new Date(Date.now() - n * 86400000);
  return d.toISOString().split('T')[0];
}

export function monthStart(date?: Date): string {
  const d = date || new Date();
  return `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, '0')}-01`;
}

export function monthEnd(date?: Date): string {
  const d = date || new Date();
  const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  return `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, '0')}-${lastDay.toString().padStart(2, '0')}`;
}

export function truncate(str: string, maxLen: number): string {
  if (!str || str.length <= maxLen) return str || '';
  return str.slice(0, maxLen - 3) + '...';
}

export function safeJsonParse<T>(str: string, fallback: T): T {
  try { return JSON.parse(str); } catch { return fallback; }
}

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function percentChange(current: number, previous: number): number {
  if (previous === 0) return current > 0 ? 100 : 0;
  return ((current - previous) / Math.abs(previous)) * 100;
}

export function groupBy<T>(items: T[], keyFn: (item: T) => string): Record<string, T[]> {
  const result: Record<string, T[]> = {};
  for (const item of items) {
    const key = keyFn(item);
    if (!result[key]) result[key] = [];
    result[key].push(item);
  }
  return result;
}

export function sumBy<T>(items: T[], valueFn: (item: T) => number): number {
  return items.reduce((sum, item) => sum + valueFn(item), 0);
}

export function debounce<T extends (...args: any[]) => any>(fn: T, delay: number): (...args: Parameters<T>) => void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  return (...args: Parameters<T>) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
