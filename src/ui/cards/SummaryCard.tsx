import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { SummaryCardData } from '../../shared/types';
import { colors, radius, shadow, spacing } from '../theme';

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
        <Text style={styles.title}>{data.period}概览</Text>
        <Text style={styles.billCount}>{data.billCount} 笔</Text>
      </View>

      <View style={styles.balanceRow}>
        <Text style={styles.balanceLabel}>结余</Text>
        <Text style={[styles.balanceAmount, { color: isPositive ? colors.income : colors.expense }]}>
          {isPositive ? '+' : ''}¥{balance.toFixed(2)}
        </Text>
      </View>

      <View style={styles.barContainer}>
        <View style={[styles.barIncome, { flex: incomeWidth || 0.1 }]} />
        <View style={[styles.barExpense, { flex: expenseWidth || 0.1 }]} />
      </View>

      <View style={styles.statsRow}>
        <View style={styles.statItem}>
          <View style={[styles.statDot, { backgroundColor: colors.income }]} />
          <Text style={styles.statLabel}>收入</Text>
          <Text style={styles.statValue}>¥{data.totalIncome.toFixed(2)}</Text>
        </View>
        <View style={styles.divider} />
        <View style={styles.statItem}>
          <View style={[styles.statDot, { backgroundColor: colors.expense }]} />
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
    backgroundColor: colors.surfaceRaised,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    ...shadow,
  },
  titleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  title: {
    fontSize: 15,
    fontWeight: '800',
    color: colors.text,
  },
  billCount: {
    fontSize: 12,
    color: colors.accent,
    backgroundColor: colors.accentSoft,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radius.sm,
    fontWeight: '700',
  },
  balanceRow: {
    marginBottom: spacing.md,
  },
  balanceLabel: {
    fontSize: 12,
    color: colors.textMuted,
    marginBottom: 2,
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
    marginBottom: spacing.lg,
    backgroundColor: colors.surfaceSoft,
  },
  barIncome: {
    backgroundColor: colors.income,
  },
  barExpense: {
    backgroundColor: colors.expense,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
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
    color: colors.textMuted,
    marginRight: spacing.sm,
  },
  statValue: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text,
    flexShrink: 1,
  },
  divider: {
    width: 1,
    height: 20,
    backgroundColor: colors.border,
  },
});
