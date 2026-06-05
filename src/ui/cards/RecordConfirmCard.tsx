import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { RecordConfirmCardData } from '../../shared/types';
import { colors, radius, shadow, spacing } from '../theme';

interface RecordConfirmCardProps {
  data: RecordConfirmCardData;
  onConfirm?: (actionId: string) => void;
  onCancel?: (actionId: string) => void;
}

const CATEGORY_ICONS: Record<string, string> = {
  '餐饮': '🍜', '交通': '🚗', '购物': '🛒', '住房': '🏠',
  '娱乐': '🎮', '医疗': '💊', '教育': '📚', '水电': '💡',
  '其他': '📦', '工资': '💰', '奖金': '🎁', '投资': '📈', '兼职': '💼',
};

const TYPE_LABELS: Record<string, string> = { income: '收入', expense: '支出', refund: '退款' };
const TYPE_COLORS: Record<string, string> = { income: colors.income, expense: colors.expense, refund: colors.purple };

export default function RecordConfirmCard({ data, onConfirm, onCancel }: RecordConfirmCardProps) {
  const { bill } = data;
  const icon = CATEGORY_ICONS[bill.category] || '📦';
  const typeLabel = TYPE_LABELS[bill.type] || bill.type;
  const typeColor = TYPE_COLORS[bill.type] || colors.textSubtle;

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Text style={styles.headerIcon}>📝</Text>
        <Text style={styles.headerTitle}>确认记账</Text>
      </View>

      <View style={styles.billPreview}>
        <Text style={styles.previewIcon}>{icon}</Text>
        <View style={styles.previewInfo}>
          <Text style={styles.previewMerchant}>{bill.merchant || '未命名'}</Text>
          <Text style={styles.previewMeta}>
            {bill.date} · {bill.category} · {typeLabel}
          </Text>
        </View>
        <Text style={[styles.previewAmount, { color: typeColor }]}>
          {bill.type === 'income' ? '+' : '-'}¥{bill.amount.toFixed(2)}
        </Text>
      </View>

      {bill.note ? (
        <View style={styles.noteRow}>
          <Text style={styles.noteIcon}>💬</Text>
          <Text style={styles.noteText}>{bill.note}</Text>
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

      {data.similarityWarning ? (
        <View style={styles.warningBox}>
          <Text style={styles.warningIcon}>⚠️</Text>
          <Text style={styles.warningText}>{data.similarityWarning}</Text>
        </View>
      ) : null}

      {data.duplicateCheck?.found ? (
        <View style={styles.dupBox}>
          <Text style={styles.dupIcon}>🔄</Text>
          <Text style={styles.dupText}>
            可能重复记账 ({data.duplicateCheck.existingId?.slice(0, 8)}...)，请确认是否仍要记录
          </Text>
        </View>
      ) : null}

      <View style={styles.actions}>
        <TouchableOpacity
          style={styles.cancelBtn}
          onPress={() => onCancel?.(data.actionId)}
          activeOpacity={0.7}
        >
          <Text style={styles.cancelText}>修改</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.confirmBtn}
          onPress={() => onConfirm?.(data.actionId)}
          activeOpacity={0.7}
        >
          <Text style={styles.confirmText}>确认记账</Text>
        </TouchableOpacity>
      </View>
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
    padding: spacing.lg,
    ...shadow,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  headerIcon: {
    fontSize: 20,
    marginRight: spacing.sm,
  },
  headerTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text,
  },
  billPreview: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  previewIcon: {
    fontSize: 30,
    marginRight: spacing.md,
  },
  previewInfo: {
    flex: 1,
  },
  previewMerchant: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.text,
  },
  previewMeta: {
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 2,
  },
  previewAmount: {
    fontSize: 18,
    fontWeight: '700',
  },
  noteRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  noteIcon: {
    fontSize: 14,
    marginRight: 6,
  },
  noteText: {
    flex: 1,
    fontSize: 13,
    color: colors.textMuted,
    lineHeight: 18,
  },
  tagRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: spacing.md,
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
  warningBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: colors.warningSoft,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.warning,
  },
  warningIcon: {
    fontSize: 14,
    marginRight: 6,
  },
  warningText: {
    flex: 1,
    fontSize: 12,
    color: colors.warning,
    lineHeight: 17,
  },
  dupBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: colors.purpleSoft,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.purple,
  },
  dupIcon: {
    fontSize: 14,
    marginRight: 6,
    marginTop: 1,
  },
  dupText: {
    flex: 1,
    fontSize: 12,
    color: colors.purple,
    lineHeight: 17,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: spacing.sm,
    marginTop: 4,
  },
  cancelBtn: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surfaceSoft,
  },
  cancelText: {
    fontSize: 14,
    color: colors.textMuted,
    fontWeight: '600',
  },
  confirmBtn: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: radius.md,
    backgroundColor: colors.accentStrong,
  },
  confirmText: {
    fontSize: 14,
    color: colors.white,
    fontWeight: '700',
  },
});
