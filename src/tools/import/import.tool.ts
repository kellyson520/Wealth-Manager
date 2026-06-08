import { getDatabase } from '../../core/database/database';
import { v4 as uuidv4 } from 'uuid';
import { captureError } from '../../core/logger/logger';
import { generateHashForBill } from '../../core/hashchain/hashchain';
import type { ToolResult, BillType } from '../../shared/types';

interface ParsedBill {
  amount: number;
  type: BillType;
  merchant: string;
  category: string;
  date: string;
  note: string;
  raw: string;
}

export async function import_csv(params: {
  csvContent: string;
  delimiter?: string;
  hasHeader?: boolean;
}): Promise<ToolResult> {
  try {
    if (!params.csvContent || params.csvContent.trim().length === 0) {
      return { success: false, error: 'CSV内容不能为空' };
    }

    const delimiter = params.delimiter || ',';
    const records = splitCSVRecords(params.csvContent.trim());
    const startIdx = params.hasHeader ? 1 : 0;
    const db = await getDatabase();
    const now = new Date().toISOString();

    const imported: { id: string; merchant: string; amount: number }[] = [];
    const errors: { line: number; raw: string; error: string }[] = [];

    for (let i = startIdx; i < records.length; i++) {
      const record = records[i];
      const line = record.text.trim();
      if (!line) continue;

      try {
        const cols = parseCSVLine(line, delimiter);

        if (cols.length < 2) {
          errors.push({ line: record.line, raw: line, error: '列数不足' });
          continue;
        }

        const amount = parseStrictPositiveAmount(cols[1]);
        if (amount === null) {
          errors.push({ line: record.line, raw: line, error: '金额无效' });
          continue;
        }

        const type: BillType = cols.length > 2 && cols[2].includes('收入') ? 'income' : 'expense';
        const billId = uuidv4();
        const merchant = cols[0] || '导入';
        const category = cols.length > 3 ? cols[3] : '其他';
        const date = cols.length > 4 && cols[4] ? cols[4] : now.split('T')[0];
        const note = cols.length > 5 ? cols[5] : '';

        await db.runAsync(
          `INSERT INTO bills (id, amount, type, category, tags, merchant, raw_description, date, note, source, created_at)
           VALUES (?, ?, ?, ?, '[]', ?, ?, ?, ?, 'import', ?)`,
          [billId, amount, type, category, merchant, line, date, note, now]
        );
        await generateHashForBill(billId);

        imported.push({ id: billId, merchant, amount });
      } catch (e) {
        errors.push({ line: record.line, raw: line, error: e instanceof Error ? e.message : '解析错误' });
      }
    }

    return {
      success: true,
      data: {
        importedCount: imported.length,
        errorCount: errors.length,
        imported,
        errors: errors.slice(0, 20),
      },
    };
  } catch (e) {
    captureError('import_csv', e, 'Failed to import CSV');
    return { success: false, error: '导入CSV时发生异常' };
  }
}

export async function import_wechat(params: {
  rawText: string;
}): Promise<ToolResult> {
  try {
    if (!params.rawText || params.rawText.trim().length === 0) {
      return { success: false, error: '微信账单文本不能为空' };
    }

    const db = await getDatabase();
    const now = new Date().toISOString();
    const bills = parseWeChatText(params.rawText);
    const imported: { id: string; merchant: string; amount: number; type: string }[] = [];

    for (const bill of bills) {
      const billId = uuidv4();
      await db.runAsync(
        `INSERT INTO bills (id, amount, type, category, tags, merchant, raw_description, date, note, source, created_at)
         VALUES (?, ?, ?, ?, '[]', ?, ?, ?, ?, 'import', ?)`,
        [billId, bill.amount, bill.type, bill.category, bill.merchant, bill.raw, bill.date, bill.note, now]
      );
      await generateHashForBill(billId);
      imported.push({ id: billId, merchant: bill.merchant, amount: bill.amount, type: bill.type });
    }

    return {
      success: true,
      data: { importedCount: imported.length, imported },
    };
  } catch (e) {
    captureError('import_wechat', e, 'Failed to import WeChat bills');
    return { success: false, error: '导入微信账单时发生异常' };
  }
}

export async function import_alipay(params: {
  rawText: string;
}): Promise<ToolResult> {
  try {
    if (!params.rawText || params.rawText.trim().length === 0) {
      return { success: false, error: '支付宝账单文本不能为空' };
    }

    const db = await getDatabase();
    const now = new Date().toISOString();
    const bills = parseAlipayText(params.rawText);
    const imported: { id: string; merchant: string; amount: number; type: string }[] = [];

    for (const bill of bills) {
      const billId = uuidv4();
      await db.runAsync(
        `INSERT INTO bills (id, amount, type, category, tags, merchant, raw_description, date, note, source, created_at)
         VALUES (?, ?, ?, ?, '[]', ?, ?, ?, ?, 'import', ?)`,
        [billId, bill.amount, bill.type, bill.category, bill.merchant, bill.raw, bill.date, bill.note, now]
      );
      await generateHashForBill(billId);
      imported.push({ id: billId, merchant: bill.merchant, amount: bill.amount, type: bill.type });
    }

    return {
      success: true,
      data: { importedCount: imported.length, imported },
    };
  } catch (e) {
    captureError('import_alipay', e, 'Failed to import Alipay bills');
    return { success: false, error: '导入支付宝账单时发生异常' };
  }
}

export async function get_import_history(params?: {
  limit?: number;
}): Promise<ToolResult> {
  try {
    const db = await getDatabase();
    const limit = params?.limit || 50;

    const rows = await db.getAllAsync<{
      date: string; count: number;
    }>(
      `SELECT date(created_at) as date, COUNT(*) as count
       FROM bills WHERE source = 'import'
       GROUP BY date(created_at)
       ORDER BY date DESC LIMIT ?`,
      [limit]
    );

    return { success: true, data: rows };
  } catch (e) {
    captureError('get_import_history', e, 'Failed to get import history');
    return { success: false, error: '获取导入历史时发生异常' };
  }
}

function parseCSVLine(line: string, delimiter: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === delimiter && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}

function splitCSVRecords(content: string): { text: string; line: number }[] {
  const records: { text: string; line: number }[] = [];
  let current = '';
  let inQuotes = false;
  let line = 1;
  let recordLine = 1;

  for (let i = 0; i < content.length; i++) {
    const ch = content[i];

    if (ch === '"') {
      current += ch;
      if (inQuotes && content[i + 1] === '"') {
        current += content[i + 1];
        i++;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if ((ch === '\n' || ch === '\r') && !inQuotes) {
      records.push({ text: current, line: recordLine });
      current = '';
      if (ch === '\r' && content[i + 1] === '\n') i++;
      line++;
      recordLine = line;
      continue;
    }

    current += ch;
    if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && content[i + 1] === '\n') {
        current += content[i + 1];
        i++;
      }
      line++;
    }
  }

  if (current.length > 0) {
    records.push({ text: current, line: recordLine });
  }

  return records;
}

function parseStrictPositiveAmount(value: string): number | null {
  const trimmed = value.trim();
  if (!/^\d+(?:\.\d+)?$/.test(trimmed)) {
    return null;
  }
  const amount = Number(trimmed);
  return Number.isFinite(amount) && amount > 0 ? amount : null;
}

function parseWeChatText(text: string): ParsedBill[] {
  const bills: ParsedBill[] = [];
  const lines = text.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const bill = parseWeChatLine(trimmed);
    if (bill) bills.push(bill);
  }

  return bills;
}

function parseWeChatLine(line: string): ParsedBill | null {
  const patterns: RegExp[] = [
    /(.+?)\s+[-−]\s*¥?(\d+\.?\d*)\s*(.*)/,
    /(.+?)\s+支出\s*¥?(\d+\.?\d*)/,
    /(.+?)\s+收入\s*¥?(\d+\.?\d*)/,
    /微信支付\s*[-−]\s*(.+?)\s+¥(\d+\.?\d*)/,
  ];

  for (const pattern of patterns) {
    const match = line.match(pattern);
    if (match) {
      const isIncome = line.includes('收入');
      return {
        amount: parseFloat(match[2]),
        type: isIncome ? 'income' : 'expense',
        merchant: match[1].trim().replace(/微信支付/, '').trim() || '微信支付',
        category: '其他',
        date: extractDate(line) || new Date().toISOString().split('T')[0],
        note: (match[3] || '').trim(),
        raw: line,
      };
    }
  }

  return null;
}

function parseAlipayText(text: string): ParsedBill[] {
  const bills: ParsedBill[] = [];
  const lines = text.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const bill = parseAlipayLine(trimmed);
    if (bill) bills.push(bill);
  }

  return bills;
}

function parseAlipayLine(line: string): ParsedBill | null {
  const patterns: RegExp[] = [
    /(.+?)\s+[-−]\s*¥?(\d+\.?\d*)\s*(.*)/,
    /(.+?)\s+消费\s*¥?(\d+\.?\d*)/,
    /(.+?)\s+付款\s*[-−]\s*¥?(\d+\.?\d*)/,
    /支付宝\s*[-−]\s*(.+?)\s+¥(\d+\.?\d*)/,
  ];

  for (const pattern of patterns) {
    const match = line.match(pattern);
    if (match) {
      const isIncome = line.includes('收入') || line.includes('退款');
      return {
        amount: parseFloat(match[2]),
        type: isIncome ? 'income' : 'expense',
        merchant: match[1].trim().replace(/支付宝/, '').trim() || '支付宝',
        category: '其他',
        date: extractDate(line) || new Date().toISOString().split('T')[0],
        note: (match[3] || '').trim(),
        raw: line,
      };
    }
  }

  return null;
}

function extractDate(text: string): string | null {
  const datePatterns = [
    /(\d{4}[-/]\d{1,2}[-/]\d{1,2})/,
    /(\d{1,2}月\d{1,2}日)/,
    /(\d{4}年\d{1,2}月\d{1,2}日)/,
  ];

  for (const pattern of datePatterns) {
    const match = text.match(pattern);
    if (match) {
      const raw = match[1];
      if (raw.includes('年')) {
        const y = raw.match(/(\d{4})年/)?.[1] || '';
        const m = raw.match(/(\d{1,2})月/)?.[1] || '';
        const d = raw.match(/(\d{1,2})日/)?.[1] || '';
        return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
      }
      if (raw.includes('月')) {
        const now = new Date();
        const m = raw.match(/(\d{1,2})月/)?.[1] || '';
        const d = raw.match(/(\d{1,2})日/)?.[1] || '';
        return `${now.getFullYear()}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
      }
      return raw;
    }
  }

  return null;
}
