import type { ToolResult } from '../../shared/types';
import { captureError } from '../../core/logger/logger';
import { getDatabase } from '../../core/database/database';
import { v4 as uuidv4 } from 'uuid';

export async function ocr_import(params: {
  rawText: string;
  source?: string;
}): Promise<ToolResult> {
  try {
    if (!params.rawText || params.rawText.trim().length === 0) {
      return { success: false, error: 'OCR文本不能为空' };
    }

    const db = await getDatabase();
    const now = new Date().toISOString();
    const lines = params.rawText.split('\n').filter((l) => l.trim());
    const imported: { id: string; merchant: string; amount: number; category: string }[] = [];

    for (const line of lines) {
      const parsed = parseOCRLine(line.trim());
      if (!parsed) continue;

      const id = uuidv4();
      await db.runAsync(
        `INSERT INTO bills (id, amount, type, category, tags, merchant, raw_description, date, note, source, created_at)
         VALUES (?, ?, ?, ?, '[]', ?, ?, ?, ?, 'ocr', ?)`,
        [id, parsed.amount, parsed.type, parsed.category, parsed.merchant, line, parsed.date, parsed.note || '', now]
      );

      imported.push({ id, merchant: parsed.merchant, amount: parsed.amount, category: parsed.category });
    }

    return {
      success: true,
      data: {
        source: params.source || 'ocr',
        importedCount: imported.length,
        imported,
      },
    };
  } catch (e) {
    captureError('ocr_import', e, 'Failed to import OCR text');
    return { success: false, error: 'OCR导入时发生异常' };
  }
}

function parseOCRLine(line: string): {
  amount: number; type: 'income' | 'expense';
  merchant: string; category: string; date: string; note: string;
} | null {
  const patterns = [
    /(.+?)\s+[-−]\s*¥?\s*(\d+\.?\d*)\s*(.*)/,
    /(.+?)\s+支出\s*¥?\s*(\d+\.?\d*)/,
    /(.+?)\s+收入\s*\+?\s*¥?\s*(\d+\.?\d*)/,
    /(.+?)\s+退款\s*¥?\s*(\d+\.?\d*)/,
    /(.+?)\s*¥\s*(\d+\.?\d*)/,
    /(.+?)\s+(\d+\.?\d{1,2})\s*$/,
  ];

  for (const pattern of patterns) {
    const match = line.match(pattern);
    if (match) {
      const merchant = match[1].trim();
      const amount = parseFloat(match[2]);

      if (isNaN(amount) || amount <= 0) continue;

      const isIncome = line.includes('收入') || line.includes('入账');
      const date = extractDate(line) || new Date().toISOString().split('T')[0];
      const category = guessCategoryFromLine(merchant);

      return {
        amount,
        type: isIncome ? 'income' : 'expense',
        merchant: merchant || '未知商户',
        category,
        date,
        note: (match[3] || '').trim(),
      };
    }
  }

  return null;
}

function guessCategoryFromLine(merchant: string): string {
  const foodTerms = ['饭', '餐', '面', '菜', '奶茶', '咖啡', '外卖', '食堂', '餐厅', '火锅', '烧烤', '水果', '美团', '饿了么'];
  const transportTerms = ['地铁', '公交', '打车', '滴滴', '出租', '油', '停车', '高铁', '机票'];
  const shopTerms = ['淘宝', '京东', '拼多多', '超市', '商场', '衣服', '鞋', '百货'];
  const houseTerms = ['房租', '物业', '水电', '燃气', '供暖'];
  const healthTerms = ['药', '医院', '诊所', '体检'];

  for (const t of foodTerms) { if (merchant.includes(t)) return '餐饮'; }
  for (const t of transportTerms) { if (merchant.includes(t)) return '交通'; }
  for (const t of shopTerms) { if (merchant.includes(t)) return '购物'; }
  for (const t of houseTerms) { if (merchant.includes(t)) return '住房'; }
  for (const t of healthTerms) { if (merchant.includes(t)) return '医疗'; }

  return '其他';
}

function extractDate(text: string): string | null {
  const patterns = [
    /(\d{4}[-/]\d{1,2}[-/]\d{1,2})/,
    /(\d{1,2}月\d{1,2}日)/,
    /(\d{4}\.\d{1,2}\.\d{1,2})/,
  ];

  for (const p of patterns) {
    const match = text.match(p);
    if (match) {
      const raw = match[1];
      if (raw.includes('月')) {
        const now = new Date();
        const m = raw.match(/(\d{1,2})月/)?.[1] || '';
        const d = raw.match(/(\d{1,2})日/)?.[1] || '';
        return `${now.getFullYear()}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
      }
      return raw.replace(/\./g, '-').replace(/\//g, '-');
    }
  }

  return null;
}
