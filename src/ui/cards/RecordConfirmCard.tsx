import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { RecordConfirmCardData } from '../../shared/types';

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
const TYPE_COLORS: Record<string, string> = { income: '#4ADE80', expense: '#F87171', refund: '#A78BFA' };

export default function RecordConfirmCard({ data, onConfirm, onCancel }: RecordConfirmCardProps) {
  const { bill } = data;
  const icon = CATEGORY_ICONS[bill.category] || '📦';
  const typeLabel = TYPE_LABELS[bill.type] || bill.type;
  const typeColor = TYPE_COLORS[bill.type] || '#888';

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
    backgroundColor: '#1a1a2e',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#2a2a4e',
    padding: 14,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  headerIcon: {
    fontSize: 20,
    marginRight: 8,
  },
  headerTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#e0e0e0',
  },
  billPreview: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#12122a',
    borderRadius: 10,
    padding: 12,
    marginBottom: 10,
  },
  previewIcon: {
    fontSize: 30,
    marginRight: 10,
  },
  previewInfo: {
    flex: 1,
  },
  previewMerchant: {
    fontSize: 15,
    fontWeight: '600',
    color: '#e0e0e0',
  },
  previewMeta: {
    fontSize: 12,
    color: '#888',
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
    color: '#aaa',
    lineHeight: 18,
  },
  tagRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 10,
  },
  tag: {
    backgroundColor: '#2a2a4e',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  tagText: {
    fontSize: 11,
    color: '#aaa',
  },
  warningBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#422006',
    borderRadius: 8,
    padding: 10,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#78350F',
  },
  warningIcon: {
    fontSize: 14,
    marginRight: 6,
  },
  warningText: {
    flex: 1,
    fontSize: 12,
    color: '#FBBF24',
    lineHeight: 17,
  },
  dupBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#311B92',
    borderRadius: 8,
    padding: 10,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#4C1D95',
  },
  dupIcon: {
    fontSize: 14,
    marginRight: 6,
    marginTop: 1,
  },
  dupText: {
    flex: 1,
    fontSize: 12,
    color: '#A78BFA',
    lineHeight: 17,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
    marginTop: 4,
  },
  cancelBtn: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#3a3a5e',
    backgroundColor: '#2a2a4e',
  },
  cancelText: {
    fontSize: 14,
    color: '#aaa',
    fontWeight: '600',
  },
  confirmBtn: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: '#4A90D9',
  },
  confirmText: {
    fontSize: 14,
    color: '#fff',
    fontWeight: '700',
  },
});
