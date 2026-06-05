import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  getPromptCacheDashboard,
  PromptCacheDashboard,
  PromptCacheRuntimeStats,
} from '../../core/cloud/prompt-cache';
import { colors, radius, shadow, spacing } from '../theme';
import AppShell from '../layout/AppShell';

function formatPercent(value: number): string {
  return `${Math.round(value * 10) / 10}%`;
}

function formatNumber(value: number): string {
  return Number.isFinite(value) ? String(Math.round(value)) : '0';
}

function StatTile({
  label,
  value,
  tone = 'neutral',
}: {
  label: string;
  value: string;
  tone?: 'neutral' | 'good' | 'warn';
}) {
  return (
    <View style={[styles.statTile, tone === 'good' && styles.statTileGood, tone === 'warn' && styles.statTileWarn]}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue}>{value}</Text>
    </View>
  );
}

function BudgetLine({ stats }: { stats: PromptCacheRuntimeStats }) {
  const budget = stats.recommendedBudget;
  return (
    <View style={styles.budgetLine}>
      <Text style={styles.budgetLabel}>动态预算</Text>
      <Text style={styles.budgetText}>
        A{budget.adaptiveContextChars} / P{budget.personaPromptChars} / R{budget.recentContextChars} / N{budget.nluContextChars}
      </Text>
    </View>
  );
}

export default function AiCacheScreen() {
  const [dashboard, setDashboard] = useState<PromptCacheDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const refresh = useCallback(async (silent = false) => {
    if (silent) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    try {
      setDashboard(await getPromptCacheDashboard({ limit: 50 }));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const overall = dashboard?.overall;
  const healthTone = useMemo(() => {
    if (!overall || overall.averageHitRate === 0) return 'warn';
    return overall.averageHitRate >= 90 ? 'good' : 'warn';
  }, [overall]);

  if (loading && !dashboard) {
    return (
      <AppShell>
        <View style={styles.loading}>
          <ActivityIndicator color={colors.accent} />
          <Text style={styles.loadingText}>加载 AI 运行数据</Text>
        </View>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => refresh(true)} tintColor={colors.accent} />}
      >
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>AI 运行面板</Text>
          <Text style={styles.subtitle}>Prompt cache telemetry</Text>
        </View>
        <TouchableOpacity style={styles.refreshBtn} onPress={() => refresh(true)} activeOpacity={0.75}>
          <Text style={styles.refreshText}>刷新</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.grid}>
        <StatTile label="缓存命中" value={formatPercent(overall?.averageHitRate || 0)} tone={healthTone} />
        <StatTile label="调用" value={formatNumber(overall?.calls || 0)} />
        <StatTile label="热缓存" value={formatNumber(overall?.warmCalls || 0)} tone={(overall?.warmCalls || 0) > 0 ? 'good' : 'warn'} />
        <StatTile label="均值 Token" value={formatNumber(overall?.averagePromptTokens || 0)} />
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Agent 预算</Text>
        {dashboard?.stats.length ? dashboard.stats.map((stat) => (
          <View key={stat.scope} style={styles.agentRow}>
            <View style={styles.agentTop}>
              <View>
                <Text style={styles.agentName}>{stat.agentId}</Text>
                <Text style={styles.scopeText}>{stat.scope}</Text>
              </View>
              <View style={styles.hitBadge}>
                <Text style={styles.hitText}>{formatPercent(stat.averageHitRate)}</Text>
              </View>
            </View>
            <View style={styles.metricRow}>
              <Text style={styles.metricText}>calls {stat.calls}</Text>
              <Text style={styles.metricText}>cached {formatNumber(stat.averageCachedTokens)}</Text>
              <Text style={styles.metricText}>completion {formatNumber(stat.averageCompletionTokens)}</Text>
            </View>
            <BudgetLine stats={stat} />
          </View>
        )) : (
          <View style={styles.empty}>
            <Text style={styles.emptyText}>暂无缓存样本，完成一次云端调用后会自动写入。</Text>
          </View>
        )}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>最近样本</Text>
        {dashboard?.recent.slice(0, 12).map((row) => (
          <View key={row.id} style={styles.sampleRow}>
            <View>
              <Text style={styles.sampleScope}>{row.scope}</Text>
              <Text style={styles.sampleMeta}>{row.source} · {row.createdAt.slice(11, 19)}</Text>
            </View>
            <View style={styles.sampleRight}>
              <Text style={styles.sampleHit}>{formatPercent(row.hitRate)}</Text>
              <Text style={styles.sampleTokens}>{row.cachedPromptTokens}/{row.promptTokens}</Text>
            </View>
          </View>
        ))}
      </View>
      </ScrollView>
    </AppShell>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  content: {
    padding: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bg,
    gap: spacing.sm,
  },
  loadingText: {
    color: colors.textMuted,
    fontSize: 13,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  title: {
    color: colors.text,
    fontSize: 20,
    fontWeight: '800',
  },
  subtitle: {
    color: colors.textMuted,
    fontSize: 12,
    marginTop: 3,
  },
  refreshBtn: {
    minHeight: 36,
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.accentStrong,
  },
  refreshText: {
    color: colors.white,
    fontSize: 13,
    fontWeight: '700',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  statTile: {
    width: '48%',
    minHeight: 86,
    borderRadius: radius.md,
    padding: spacing.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    justifyContent: 'space-between',
    ...shadow,
  },
  statTileGood: {
    borderColor: colors.income,
    backgroundColor: colors.incomeSoft,
  },
  statTileWarn: {
    borderColor: colors.warning,
    backgroundColor: colors.warningSoft,
  },
  statLabel: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '700',
  },
  statValue: {
    color: colors.text,
    fontSize: 26,
    fontWeight: '800',
  },
  section: {
    marginBottom: spacing.xl,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '800',
    marginBottom: spacing.sm,
  },
  agentRow: {
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceRaised,
    borderWidth: 1,
    borderColor: colors.border,
  },
  agentTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  agentName: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '800',
  },
  scopeText: {
    color: colors.textSubtle,
    fontSize: 11,
    marginTop: 2,
  },
  hitBadge: {
    minWidth: 64,
    alignItems: 'center',
    paddingVertical: 5,
    borderRadius: radius.pill,
    backgroundColor: colors.accentSoft,
    borderWidth: 1,
    borderColor: colors.accent,
  },
  hitText: {
    color: colors.accent,
    fontSize: 13,
    fontWeight: '800',
  },
  metricRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
    marginTop: spacing.md,
  },
  metricText: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '600',
  },
  budgetLine: {
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  budgetLabel: {
    color: colors.textSubtle,
    fontSize: 11,
    marginBottom: 3,
  },
  budgetText: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '700',
  },
  sampleRow: {
    minHeight: 58,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    gap: spacing.md,
  },
  sampleScope: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '700',
  },
  sampleMeta: {
    color: colors.textSubtle,
    fontSize: 11,
    marginTop: 2,
  },
  sampleRight: {
    alignItems: 'flex-end',
  },
  sampleHit: {
    color: colors.accent,
    fontSize: 13,
    fontWeight: '800',
  },
  sampleTokens: {
    color: colors.textMuted,
    fontSize: 11,
    marginTop: 2,
  },
  empty: {
    padding: spacing.lg,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  emptyText: {
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 18,
  },
});
