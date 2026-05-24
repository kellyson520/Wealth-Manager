import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { SummaryCardData } from '../../shared/types';

interface SummaryCardProps {
  data: SummaryCardData;
}

export default function SummaryCard({ data }: SummaryCardProps) {
  const balance = data.totalIncome - data.totalExpense;
  const isPositive = balance >= 0;

  const expenseWidth =
    data.totalIncome + data.totalExpense > 0
      ? Math.max(10, Math.round((data.totalExpense / (data.totalIncome + data.totalExpense)) * 100))
      : 0;

  const incomeWidth = 100 - expenseWidth;

  return (
    <View style={styles.card}>
      <View style={styles.titleRow}>
        <Text style={styles.title}>📊 {data.period}概览</Text>
        <Text style={styles.billCount}>{data.billCount} 笔</Text>
      </View>

      <View style={styles.balanceRow}>
        <Text style={styles.balanceLabel}>结余</Text>
        <Text style={[styles.balanceAmount, { color: isPositive ? '#4ADE80' : '#F87171' }]}>
          {isPositive ? '+' : ''}¥{balance.toFixed(2)}
        </Text>
      </View>

      <View style={styles.barContainer}>
        <View style={[styles.barIncome, { flex: incomeWidth || 0.1 }]} />
        <View style={[styles.barExpense, { flex: expenseWidth || 0.1 }]} />
      </View>

      <View style={styles.statsRow}>
        <View style={styles.statItem}>
          <View style={[styles.statDot, { backgroundColor: '#4ADE80' }]} />
          <Text style={styles.statLabel}>收入</Text>
          <Text style={styles.statValue}>¥{data.totalIncome.toFixed(2)}</Text>
        </View>
        <View style={styles.divider} />
        <View style={styles.statItem}>
          <View style={[styles.statDot, { backgroundColor: '#F87171' }]} />
          <Text style={styles.statLabel}>支出</Text>
          <Text style={styles.statValue}>¥{data.totalExpense.toFixed(2)}</Text>
        </View>
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
  titleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  title: {
    fontSize: 15,
    fontWeight: '700',
    color: '#e0e0e0',
  },
  billCount: {
    fontSize: 12,
    color: '#888',
    backgroundColor: '#2a2a4e',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  balanceRow: {
    marginBottom: 12,
  },
  balanceLabel: {
    fontSize: 12,
    color: '#888',
  },
  balanceAmount: {
    fontSize: 28,
    fontWeight: '800',
  },
  barContainer: {
    flexDirection: 'row',
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 14,
  },
  barIncome: {
    backgroundColor: '#4ADE80',
  },
  barExpense: {
    backgroundColor: '#F87171',
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statItem: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  statDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 6,
  },
  statLabel: {
    fontSize: 13,
    color: '#aaa',
    marginRight: 8,
  },
  statValue: {
    fontSize: 15,
    fontWeight: '700',
    color: '#e0e0e0',
  },
  divider: {
    width: 1,
    height: 20,
    backgroundColor: '#2a2a4e',
    marginHorizontal: 12,
  },
});
