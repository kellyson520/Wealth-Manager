import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { BillCardData } from '../../shared/types';
import { colors, radius, shadow, spacing } from '../theme';

interface BillCardProps {
  data: BillCardData;
}

const CATEGORY_ICONS: Record<string, string> = {
  '餐饮': '🍜',
  '交通': '🚗',
  '购物': '🛒',
  '住房': '🏠',
  '娱乐': '🎮',
  '医疗': '💊',
  '教育': '📚',
  '水电': '💡',
  '其他': '📦',
  '工资': '💰',
  '奖金': '🎁',
  '投资': '📈',
  '兼职': '💼',
};

const TYPE_LABELS: Record<string, string> = { income: '收入', expense: '支出', refund: '退款' };
const TYPE_COLORS: Record<string, string> = { income: colors.income, expense: colors.expense, refund: colors.purple };

export default function BillCard({ data }: BillCardProps) {
  const { bill } = data;
  const icon = CATEGORY_ICONS[bill.category] || '📦';
  const typeLabel = TYPE_LABELS[bill.type] || bill.type;
  const typeColor = TYPE_COLORS[bill.type] || colors.textSubtle;

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <View style={styles.iconWrap}>
          <Text style={styles.icon}>{icon}</Text>
        </View>
        <View style={styles.headerText}>
          <Text style={styles.merchant} numberOfLines={1}>
            {bill.merchant || '未命名'}
          </Text>
          <Text style={styles.type} numberOfLines={1}>
            {bill.date} · {bill.category} · {typeLabel}
          </Text>
        </View>
        <Text style={[styles.amount, { color: typeColor }]}>
          {bill.type === 'income' ? '+' : '-'}¥{bill.amount.toFixed(2)}
        </Text>
      </View>
      {bill.note ? (
        <View style={styles.noteRow}>
          <Text style={styles.noteText} numberOfLines={2}>
            💬 {bill.note}
          </Text>
        </View>
      ) : null}
      {bill.tags.length > 0 ? (
        <View style={styles.tagRow}>
          {bill.tags.map((tag) => (
            <View key={tag} style={styles.tag}>
              <Text style={styles.tagText}>{tag}</Text>
            </View>
          ))}
        </View>
      ) : null}
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
  },
  iconWrap: {
    width: 38,
    height: 38,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceSoft,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing.md,
  },
  icon: {
    fontSize: 22,
  },
  headerText: {
    flex: 1,
    minWidth: 0,
  },
  merchant: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text,
  },
  type: {
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 2,
  },
  amount: {
    fontSize: 16,
    fontWeight: '800',
    marginLeft: spacing.sm,
  },
  noteRow: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.md,
  },
  noteText: {
    fontSize: 13,
    color: colors.textMuted,
    lineHeight: 18,
  },
  tagRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: spacing.md,
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
    fontWeight: '600',
  },
});
