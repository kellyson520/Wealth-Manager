import { v4 as uuidv4 } from 'uuid';
import { getDatabase } from '../../core/database/database';
import { BillRecord, ToolResult } from '../../shared/types';
import { captureError } from '../../core/logger/logger';
import { generateHashForBill, rebuildHashChain } from '../../core/hashchain/hashchain';
import { recordCorrection } from '../../core/rules/rule-learner';

const EXPENSE_CATEGORIES = ['餐饮', '交通', '购物', '住房', '娱乐', '医疗', '教育', '水电', '其他'];
const INCOME_CATEGORIES = ['工资', '奖金', '投资', '兼职', '其他收入'];

const CATEGORY_ALIASES: { category: string; patterns: RegExp[] }[] = [
  { category: '餐饮', patterns: [/餐饮|吃|饭|早餐|午餐|午饭|晚餐|晚饭|夜宵|火锅|奶茶|咖啡|外卖|餐厅|食堂|水果|零食/] },
  { category: '交通', patterns: [/交通|打车|出租|网约车|地铁|公交|高铁|火车|机票|停车|油费|加油|过路费/] },
  { category: '购物', patterns: [/购物|买|超市|淘宝|京东|拼多多|衣服|鞋|日用品|家电|数码/] },
  { category: '住房', patterns: [/住房|房租|租房|房贷|物业|公寓|水电房租/] },
  { category: '娱乐', patterns: [/娱乐|电影|游戏|会员|演唱会|盲盒|玩具|酒吧|ktv/i] },
  { category: '医疗', patterns: [/医疗|医院|药|体检|门诊|牙|医保/] },
  { category: '教育', patterns: [/教育|课程|学费|书|培训|考试|教材/] },
  { category: '水电', patterns: [/水电|电费|水费|燃气|煤气|话费|网费|宽带/] },
  { category: '工资', patterns: [/工资|薪水|薪资|发薪|月薪/] },
  { category: '奖金', patterns: [/奖金|年终奖|绩效|提成/] },
  { category: '投资', patterns: [/投资|股票|基金|理财|分红|利息/] },
  { category: '兼职', patterns: [/兼职|副业|外快/] },
];

export function normalizeBillCategory(
  category: string | undefined,
  type: 'income' | 'expense' | 'refund',
  context: string = ''
): string {
  const allowed = type === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
  const raw = `${category || ''} ${context || ''}`.trim();
  if (!raw) return type === 'income' ? '其他收入' : '其他';
  if (allowed.includes(category || '')) return category as string;

  for (const alias of CATEGORY_ALIASES) {
    if (!allowed.includes(alias.category)) continue;
    if (alias.patterns.some((pattern) => pattern.test(raw))) return alias.category;
  }

  return type === 'income' ? '其他收入' : '其他';
}

export async function add_bill(params: {
  amount: number;
  type: 'income' | 'expense';
  merchant?: string;
  category?: string;
  note?: string;
  date?: string;
}): Promise<ToolResult> {
  if (!params.amount || params.amount <= 0) {
    return { success: false, error: '金额不正确', errorCode: '1002' };
  }

  const db = await getDatabase();
  const id = uuidv4();
  const now = new Date().toISOString();
  const date = params.date || now.split('T')[0];
  const category = normalizeBillCategory(
    params.category,
    params.type,
    `${params.merchant || ''} ${params.note || ''}`
  );

  try {
    await db.runAsync(
      `INSERT INTO bills (id, amount, type, category, tags, merchant, raw_description, date, note, source, created_at)
       VALUES (?, ?, ?, ?, '[]', ?, ?, ?, ?, 'manual', ?)`,
      [
        id,
        params.amount,
        params.type,
        category,
        params.merchant || '',
        params.merchant || params.note || '',
        date,
        params.note || '',
        now,
      ]
    );

    const bill = await db.getFirstAsync<BillRecord>(
      'SELECT * FROM bills WHERE id = ?',
      [id]
    );

	    await generateHashForBill(id);

    return { success: true, data: bill };
  } catch (e) {
    captureError('BillsTool.add_bill', e, 'Failed to insert bill');
    return { success: false, error: '记账失败', errorCode: '1000' };
  }
}

export async function get_bill(params: { billId: string }): Promise<ToolResult> {
  try {
    if (!params.billId) return { success: false, error: '账单ID不能为空' };
    const db = await getDatabase();
    const bill = await db.getFirstAsync<BillRecord>(
      'SELECT * FROM bills WHERE id = ?', [params.billId]
    );
    if (!bill) return { success: false, error: '账单不存在', errorCode: '1001' };
    return { success: true, data: bill };
  } catch (e) {
    captureError('BillsTool.get_bill', e, 'Failed to get bill');
    return { success: false, error: '查询账单失败', errorCode: '1000' };
  }
}

export async function modify_bill(params: {
  billId: string;
  amount?: number;
  category?: string;
  merchant?: string;
  note?: string;
  date?: string;
  type?: 'income' | 'expense' | 'refund';
}): Promise<ToolResult> {
  try {
    if (!params.billId) return { success: false, error: '账单ID不能为空' };
    const db = await getDatabase();

    const existing = await db.getFirstAsync<BillRecord>(
      'SELECT * FROM bills WHERE id = ?', [params.billId]
    );
    if (!existing) return { success: false, error: '账单不存在' };

    const updates: string[] = [];
    const values: (string | number)[] = [];
    let normalizedCategory: string | undefined;

    if (params.amount !== undefined) { updates.push('amount = ?'); values.push(params.amount); }
    if (params.category !== undefined) {
      normalizedCategory = normalizeBillCategory(
        params.category,
        (params.type || existing.type) as 'income' | 'expense' | 'refund',
        `${params.merchant || existing.merchant || ''} ${params.note || existing.note || ''}`
      );
      updates.push('category = ?');
      values.push(normalizedCategory);
    }
    if (params.merchant !== undefined) {
      updates.push('merchant = ?');
      values.push(params.merchant);
      if (!params.note) { updates.push('raw_description = ?'); values.push(params.merchant); }
    }
    if (params.note !== undefined) { updates.push('note = ?'); values.push(params.note); }
    if (params.date !== undefined) { updates.push('date = ?'); values.push(params.date); }
    if (params.type !== undefined) { updates.push('type = ?'); values.push(params.type); }

    if (updates.length === 0) return { success: false, error: '没有需要修改的字段' };

    const oldCategory = existing.category;
    const oldMerchant = existing.merchant;

    values.push(params.billId);
    await db.runAsync(
      `UPDATE bills SET ${updates.join(', ')} WHERE id = ?`, values
    );

	    if (normalizedCategory !== undefined && normalizedCategory !== oldCategory) {
	      recordCorrection({
        billId: params.billId,
        merchant: oldMerchant,
        originalCategory: oldCategory,
        correctedCategory: normalizedCategory,
	      }).catch(() => {});
	    }
	    await rebuildHashChain();

    const updated = await db.getFirstAsync<BillRecord>(
      'SELECT * FROM bills WHERE id = ?', [params.billId]
    );
    return { success: true, data: updated };
  } catch (e) {
    captureError('BillsTool.modify_bill', e, 'Failed to modify bill');
    return { success: false, error: '修改账单失败', errorCode: '1000' };
  }
}

export async function delete_bill(params: { billId: string; confirmed?: boolean }): Promise<ToolResult> {
	  try {
	    if (!params.billId) return { success: false, error: '账单ID不能为空' };
	    if (!params.confirmed) {
	      return { success: false, error: '删除账单需要用户显式确认', errorCode: 'CONFIRMATION_REQUIRED' };
	    }
	    const db = await getDatabase();

    const existing = await db.getFirstAsync<BillRecord>(
      'SELECT * FROM bills WHERE id = ?', [params.billId]
    );
    if (!existing) return { success: false, error: '账单不存在' };

	    await db.runAsync('DELETE FROM bills WHERE id = ?', [params.billId]);
	    await rebuildHashChain();
    return { success: true, data: { id: params.billId, deleted: true, amount: existing.amount, merchant: existing.merchant } };
  } catch (e) {
    captureError('BillsTool.delete_bill', e, 'Failed to delete bill');
    return { success: false, error: '删除账单失败', errorCode: '1000' };
  }
}

export async function search_bills(params: {
  keyword?: string;
  startDate?: string;
  endDate?: string;
  category?: string;
  type?: 'income' | 'expense';
  limit?: number;
  offset?: number;
}): Promise<ToolResult> {
  const db = await getDatabase();
  const conditions: string[] = [];
  const values: (string | number)[] = [];

  if (params.keyword) {
    conditions.push('(merchant LIKE ? OR raw_description LIKE ? OR note LIKE ?)');
    const kw = `%${params.keyword}%`;
    values.push(kw, kw, kw);
  }
  if (params.startDate) { conditions.push('date >= ?'); values.push(params.startDate); }
  if (params.endDate) { conditions.push('date <= ?'); values.push(params.endDate); }
  if (params.category) {
    conditions.push('category = ?');
    values.push(normalizeBillCategory(params.category, params.type || 'expense'));
  }
  if (params.type) { conditions.push('type = ?'); values.push(params.type); }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const limit = params.limit || 50;
  const offset = params.offset || 0;

  try {
    const bills = await db.getAllAsync<BillRecord>(
      `SELECT * FROM bills ${where} ORDER BY date DESC, created_at DESC LIMIT ? OFFSET ?`,
      [...values, limit, offset]
    );
    return { success: true, data: bills };
  } catch (e) {
    captureError('BillsTool.search_bills', e, 'Failed to search bills');
    return { success: false, error: '查询失败', errorCode: '1000' };
  }
}

export async function split_bill(params: {
  billId: string;
  splits: { amount: number; category?: string; merchant?: string; note?: string }[];
}): Promise<ToolResult> {
  try {
    if (!params.billId) return { success: false, error: '账单ID不能为空' };
    if (!params.splits || params.splits.length < 2) return { success: false, error: '至少需要2个拆分项' };

    const db = await getDatabase();
    const original = await db.getFirstAsync<BillRecord>(
      'SELECT * FROM bills WHERE id = ?', [params.billId]
    );
    if (!original) return { success: false, error: '原始账单不存在' };

    const totalSplit = params.splits.reduce((sum, s) => sum + s.amount, 0);
    if (Math.abs(totalSplit - original.amount) > 0.01) {
      return { success: false, error: `拆分金额合计(${totalSplit})与原账单(${original.amount})不匹配` };
    }

    const now = new Date().toISOString();
    const created: { id: string; amount: number; category: string }[] = [];

    for (const split of params.splits) {
      const id = uuidv4();
      await db.runAsync(
        `INSERT INTO bills (id, amount, type, category, tags, merchant, raw_description, date, note, source, created_at)
         VALUES (?, ?, ?, ?, '[]', ?, ?, ?, ?, 'manual', ?)`,
        [
          id, split.amount, original.type,
          split.category || original.category,
          split.merchant || original.merchant,
          `${split.merchant || original.merchant} (拆分自 ${original.merchant})`,
          original.date,
          split.note || `拆分自: ${original.merchant} ¥${original.amount}`,
          now,
        ]
      );
      created.push({ id, amount: split.amount, category: split.category || original.category });
    }

    await db.runAsync('UPDATE bills SET note = note || ? WHERE id = ?', [
      ` [已拆分为${params.splits.length}笔]`, params.billId,
    ]);

    return { success: true, data: { originalBillId: params.billId, originalAmount: original.amount, splits: created } };
  } catch (e) {
    captureError('BillsTool.split_bill', e, 'Failed to split bill');
    return { success: false, error: '拆分账单失败', errorCode: '1000' };
  }
}

export async function refund_bill(params: {
  billId: string;
  amount?: number;
  note?: string;
}): Promise<ToolResult> {
  try {
    if (!params.billId) return { success: false, error: '账单ID不能为空' };

    const db = await getDatabase();
    const original = await db.getFirstAsync<BillRecord>(
      'SELECT * FROM bills WHERE id = ?', [params.billId]
    );
    if (!original) return { success: false, error: '原账单不存在' };

    const refundAmount = params.amount || original.amount;
    if (refundAmount <= 0 || refundAmount > original.amount) {
      return { success: false, error: '退款金额不合法' };
    }

    const id = uuidv4();
    const now = new Date().toISOString();

    await db.runAsync(
      `INSERT INTO bills (id, amount, type, category, tags, merchant, raw_description, date, note, source, created_at)
       VALUES (?, ?, 'refund', ?, '[]', ?, ?, ?, ?, 'manual', ?)`,
      [
        id, refundAmount, original.category,
        original.merchant,
        `退款: ${original.merchant} (原账单ID: ${original.id})`,
        new Date().toISOString().split('T')[0],
        params.note || `退款 ${refundAmount}`,
        now,
      ]
    );

    const refundBill = await db.getFirstAsync<BillRecord>(
      'SELECT * FROM bills WHERE id = ?', [id]
    );

    return {
      success: true,
      data: {
        originalBillId: params.billId,
        refundBill: refundBill,
        originalAmount: original.amount,
        refundedAmount: refundAmount,
      },
    };
  } catch (e) {
    captureError('BillsTool.refund_bill', e, 'Failed to refund bill');
    return { success: false, error: '退款失败', errorCode: '1000' };
  }
}
