import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { BillDetailCardData } from '../../shared/types';

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
const TYPE_COLORS: Record<string, string> = { income: '#4ADE80', expense: '#F87171', refund: '#A78BFA' };
const SOURCE_LABELS: Record<string, string> = { manual: '手动', import: '导入', auto: '自动', ocr: 'OCR' };

export default function BillDetailCard({ data, onEdit, onDelete }: BillDetailCardProps) {
  const { bill } = data;
  const icon = CATEGORY_ICONS[bill.category] || '📦';
  const typeLabel = TYPE_LABELS[bill.type] || bill.type;
  const typeColor = TYPE_COLORS[bill.type] || '#888';

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
          {bill.tags.map((tag) => (
            <View key={tag} style={styles.tag}>
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
    backgroundColor: '#1a1a2e',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#2a2a4e',
    overflow: 'hidden',
  },
  hero: {
    alignItems: 'center',
    padding: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#2a2a4e',
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
    padding: 14,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 7,
    borderBottomWidth: 1,
    borderBottomColor: '#1e1e32',
  },
  detailLabel: {
    fontSize: 13,
    color: '#888',
    flex: 1,
  },
  detailValue: {
    fontSize: 13,
    color: '#ddd',
    fontWeight: '500',
    flex: 2,
    textAlign: 'right',
  },
  tagRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 14,
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
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    padding: 12,
    gap: 10,
    borderTopWidth: 1,
    borderTopColor: '#2a2a4e',
  },
  editBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#2a2a4e',
    borderWidth: 1,
    borderColor: '#3a3a5e',
  },
  editText: {
    fontSize: 13,
    color: '#aaa',
    fontWeight: '600',
  },
  deleteBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#7F1D1D',
  },
  deleteText: {
    fontSize: 13,
    color: '#F87171',
    fontWeight: '600',
  },
});
