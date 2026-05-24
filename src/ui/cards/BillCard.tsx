import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { BillCardData } from '../../shared/types';

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
const TYPE_COLORS: Record<string, string> = { income: '#4ADE80', expense: '#F87171', refund: '#A78BFA' };

export default function BillCard({ data }: BillCardProps) {
  const { bill } = data;
  const icon = CATEGORY_ICONS[bill.category] || '📦';
  const typeLabel = TYPE_LABELS[bill.type] || bill.type;
  const typeColor = TYPE_COLORS[bill.type] || '#888';

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Text style={styles.icon}>{icon}</Text>
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
    backgroundColor: '#1a1a2e',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#2a2a4e',
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
  },
  icon: {
    fontSize: 28,
    marginRight: 10,
  },
  headerText: {
    flex: 1,
  },
  merchant: {
    fontSize: 15,
    fontWeight: '600',
    color: '#e0e0e0',
  },
  type: {
    fontSize: 12,
    color: '#888',
    marginTop: 2,
  },
  amount: {
    fontSize: 16,
    fontWeight: '700',
  },
  noteRow: {
    paddingHorizontal: 12,
    paddingBottom: 10,
  },
  noteText: {
    fontSize: 13,
    color: '#aaa',
    lineHeight: 18,
  },
  tagRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 12,
    paddingBottom: 10,
    gap: 6,
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
});
