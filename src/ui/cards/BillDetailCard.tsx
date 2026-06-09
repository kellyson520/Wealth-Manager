import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { BillDetailCardData } from '../../shared/types';
import { colors, radius, shadow, spacing } from '../theme';

interface BillDetailCardProps {
  data: BillDetailCardData;
  onEdit?: () => void;
  onDelete?: () => void;
}

const CATEGORY_ICONS: Record<string, string> = {
  '餐饮': '🍜', '交通': '🚗', '购物': '🛒', '住房': '🏠',
  '娱乐': '🎮', '医疗': '💊', '教育': '📚', '水电': '💡',
  '其他': '📦', '工资': '💰', '奖金': '🎁', '投资': '📈', '兼职': '💼',
};

const TYPE_LABELS: Record<string, string> = { income: '收入', expense: '支出', refund: '退款' };
const TYPE_COLORS: Record<string, string> = { income: colors.income, expense: colors.expense, refund: colors.purple };
const SOURCE_LABELS: Record<string, string> = { manual: '手动', import: '导入', auto: '自动', ocr: 'OCR' };

export default function BillDetailCard({ data, onEdit, onDelete }: BillDetailCardProps) {
  const { bill } = data;
  const icon = CATEGORY_ICONS[bill.category] || '📦';
  const typeLabel = TYPE_LABELS[bill.type] || bill.type;
  const typeColor = TYPE_COLORS[bill.type] || colors.textSubtle;

  return (
    <View style={styles.card}>
      <View style={styles.hero}>
        <Text style={styles.heroIcon}>{icon}</Text>
        <Text style={[styles.heroAmount, { color: typeColor }]}>
          {bill.type === 'income' ? '+' : '-'}¥{bill.amount.toFixed(2)}
        </Text>
      </View>

      <View style={styles.details}>
        <DetailRow label="商家" value={bill.merchant || '未命名'} />
        <DetailRow label="分类" value={bill.category} />
        <DetailRow label="类型" value={typeLabel} />
        <DetailRow label="日期" value={bill.date} />
        <DetailRow label="来源" value={SOURCE_LABELS[bill.source] || bill.source} />
        {bill.note ? <DetailRow label="备注" value={bill.note} /> : null}
        <DetailRow label="记录ID" value={bill.id.slice(0, 8) + '...'} />
      </View>

      {bill.tags.length > 0 ? (
        <View style={styles.tagRow}>
          {bill.tags.map((tag, index) => (
            <View key={`${tag}-${index}`} style={styles.tag}>
              <Text style={styles.tagText}>{tag}</Text>
            </View>
          ))}
        </View>
      ) : null}

      {data.showActions ? (
        <View style={styles.actions}>
          <TouchableOpacity
            style={styles.editBtn}
            onPress={data.onEdit || onEdit}
            activeOpacity={0.7}
          >
            <Text style={styles.editText}>编辑</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.deleteBtn}
            onPress={data.onDelete || onDelete}
            activeOpacity={0.7}
          >
            <Text style={styles.deleteText}>删除</Text>
          </TouchableOpacity>
        </View>
      ) : null}
    </View>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginTop: 8,
    backgroundColor: colors.surfaceRaised,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
    ...shadow,
  },
  hero: {
    alignItems: 'center',
    padding: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  heroIcon: {
    fontSize: 36,
    marginBottom: 6,
  },
  heroAmount: {
    fontSize: 28,
    fontWeight: '800',
  },
  details: {
    padding: spacing.lg,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 7,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  detailLabel: {
    fontSize: 13,
    color: colors.textMuted,
    flex: 1,
  },
  detailValue: {
    fontSize: 13,
    color: colors.text,
    fontWeight: '500',
    flex: 2,
    textAlign: 'right',
  },
  tagRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    gap: 6,
  },
  tag: {
    backgroundColor: colors.surfaceSoft,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
  },
  tagText: {
    fontSize: 11,
    color: colors.textMuted,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    padding: spacing.md,
    gap: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  editBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceSoft,
    borderWidth: 1,
    borderColor: colors.borderStrong,
  },
  editText: {
    fontSize: 13,
    color: colors.textMuted,
    fontWeight: '600',
  },
  deleteBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: radius.md,
    backgroundColor: colors.dangerSoft,
    borderWidth: 1,
    borderColor: colors.danger,
  },
  deleteText: {
    fontSize: 13,
    color: colors.expense,
    fontWeight: '600',
  },
});
