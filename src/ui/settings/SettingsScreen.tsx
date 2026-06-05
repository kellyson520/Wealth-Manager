import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import type { PersonaParams, UserPreferences } from '../../shared/types';
import {
  getPersonaSnapshot,
  isNluLearningEnabled,
  listAiMemories,
  setNluLearningEnabled,
} from '../../core/memory/adaptive-context';
import { getPromptCacheDashboard } from '../../core/cloud/prompt-cache';
import { loadPersona, setPersonaParams, setPreferences } from '../../core/persona/persona-engine';
import { colors, radius, shadow, spacing } from '../theme';

type SettingsState = {
  personaParams: PersonaParams;
  preferences: UserPreferences;
  learningEnabled: boolean;
  personaVersion: number;
  memoryCount: number;
  cacheHitRate: number;
};

const DEFAULT_STATE: SettingsState = {
  personaParams: { rigor: 5, humor: 5, proactivity: 5 },
  preferences: { currency: 'CNY', language: 'zh-Hans', theme: 'dark', firstDayOfWeek: 1 },
  learningEnabled: true,
  personaVersion: 1,
  memoryCount: 0,
  cacheHitRate: 0,
};

const PERSONA_CONTROLS: { key: keyof PersonaParams; label: string; hint: string }[] = [
  { key: 'rigor', label: '严谨', hint: '分类、金额、确认话术更审慎' },
  { key: 'humor', label: '轻松', hint: '回复更自然，但不牺牲准确性' },
  { key: 'proactivity', label: '主动', hint: '更积极给出提醒、预算和复盘' },
];

export default function SettingsScreen() {
  const router = useRouter();
  const [state, setState] = useState<SettingsState>(DEFAULT_STATE);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [savingKey, setSavingKey] = useState<string | null>(null);

  const refresh = useCallback(async (silent = false) => {
    if (silent) setRefreshing(true);
    else setLoading(true);
    try {
      const [persona, snapshot, learningEnabled, memories, cache] = await Promise.all([
        loadPersona(),
        getPersonaSnapshot(),
        isNluLearningEnabled(),
        listAiMemories({ limit: 80 }),
        getPromptCacheDashboard({ limit: 40 }),
      ]);
      setState({
        personaParams: persona.personaParams,
        preferences: persona.preferences,
        learningEnabled,
        personaVersion: snapshot.version,
        memoryCount: memories.length,
        cacheHitRate: cache.overall.averageHitRate,
      });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const cacheTone = useMemo(() => {
    if (state.cacheHitRate >= 90) return colors.income;
    if (state.cacheHitRate > 0) return colors.warning;
    return colors.textSubtle;
  }, [state.cacheHitRate]);

  const updatePersona = useCallback(async (key: keyof PersonaParams, delta: number) => {
    const next = Math.max(0, Math.min(10, state.personaParams[key] + delta));
    setSavingKey(key);
    try {
      const personaParams = await setPersonaParams({ [key]: next });
      setState((prev) => ({ ...prev, personaParams }));
    } finally {
      setSavingKey(null);
    }
  }, [state.personaParams]);

  const updatePreference = useCallback(async (prefs: Partial<UserPreferences>, key: string) => {
    setSavingKey(key);
    try {
      const preferences = await setPreferences(prefs);
      setState((prev) => ({ ...prev, preferences }));
    } finally {
      setSavingKey(null);
    }
  }, []);

  const toggleLearning = useCallback(async (enabled: boolean) => {
    setSavingKey('learning');
    try {
      const learningEnabled = await setNluLearningEnabled(enabled);
      setState((prev) => ({ ...prev, learningEnabled }));
    } finally {
      setSavingKey(null);
    }
  }, []);

  if (loading) {
    return (
      <SafeAreaView style={styles.loading}>
        <ActivityIndicator color={colors.accent} />
        <Text style={styles.loadingText}>加载设置</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => refresh(true)} tintColor={colors.accent} />}
      >
        <View style={styles.header}>
          <View>
            <Text style={styles.title}>设置</Text>
            <Text style={styles.subtitle}>人格 · 记忆 · 学习 · 运行</Text>
          </View>
          <TouchableOpacity style={styles.headerBtn} onPress={() => router.push('/ai-cache')}>
            <Text style={styles.headerBtnText}>运行面板</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.summaryGrid}>
          <SummaryItem label="人格版本" value={`v${state.personaVersion}`} />
          <SummaryItem label="AI记忆" value={`${state.memoryCount}`} />
          <SummaryItem label="缓存命中" value={`${Math.round(state.cacheHitRate * 10) / 10}%`} valueColor={cacheTone} />
        </View>

        <Section title="人格颗粒">
          {PERSONA_CONTROLS.map((item) => (
            <View key={item.key} style={styles.controlRow}>
              <View style={styles.controlText}>
                <Text style={styles.controlLabel}>{item.label}</Text>
                <Text style={styles.controlHint}>{item.hint}</Text>
              </View>
              <View style={styles.stepper}>
                <TouchableOpacity
                  style={styles.stepBtn}
                  onPress={() => updatePersona(item.key, -1)}
                  disabled={savingKey === item.key}
                >
                  <Text style={styles.stepText}>-</Text>
                </TouchableOpacity>
                <Text style={styles.stepValue}>{state.personaParams[item.key].toFixed(0)}</Text>
                <TouchableOpacity
                  style={styles.stepBtn}
                  onPress={() => updatePersona(item.key, 1)}
                  disabled={savingKey === item.key}
                >
                  <Text style={styles.stepText}>+</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))}
        </Section>

        <Section title="偏好">
          <SegmentedRow
            label="货币"
            value={state.preferences.currency}
            options={['CNY', 'USD', 'HKD']}
            onChange={(currency) => updatePreference({ currency }, 'currency')}
          />
          <SegmentedRow
            label="语言"
            value={state.preferences.language}
            options={['zh-Hans', 'en-US']}
            onChange={(language) => updatePreference({ language }, 'language')}
          />
          <SegmentedRow
            label="周起始"
            value={String(state.preferences.firstDayOfWeek)}
            options={['1', '0']}
            labels={{ '1': '周一', '0': '周日' }}
            onChange={(firstDayOfWeek) => updatePreference({ firstDayOfWeek: Number(firstDayOfWeek) as 0 | 1 }, 'firstDayOfWeek')}
          />
        </Section>

        <Section title="学习">
          <View style={styles.switchRow}>
            <View style={styles.controlText}>
              <Text style={styles.controlLabel}>NLU 自动扩充</Text>
              <Text style={styles.controlHint}>从成功工具调用和纠错中沉淀表达别名</Text>
            </View>
            <Switch
              value={state.learningEnabled}
              onValueChange={toggleLearning}
              disabled={savingKey === 'learning'}
              trackColor={{ false: colors.surfaceSoft, true: colors.accentSoft }}
              thumbColor={state.learningEnabled ? colors.accent : colors.textSubtle}
            />
          </View>
        </Section>

        <Section title="调试入口">
          <View style={styles.navGrid}>
            <NavButton label="AI运行" onPress={() => router.push('/ai-cache')} />
            <NavButton label="日志" onPress={() => router.push('/log')} />
          </View>
        </Section>
      </ScrollView>
    </SafeAreaView>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.sectionBody}>{children}</View>
    </View>
  );
}

function SummaryItem({ label, value, valueColor }: { label: string; value: string; valueColor?: string }) {
  return (
    <View style={styles.summaryItem}>
      <Text style={styles.summaryLabel}>{label}</Text>
      <Text style={[styles.summaryValue, valueColor ? { color: valueColor } : null]}>{value}</Text>
    </View>
  );
}

function SegmentedRow({
  label,
  value,
  options,
  labels = {},
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  labels?: Record<string, string>;
  onChange: (value: string) => void;
}) {
  return (
    <View style={styles.segmentRow}>
      <Text style={styles.controlLabel}>{label}</Text>
      <View style={styles.segmentGroup}>
        {options.map((option) => {
          const active = value === option;
          return (
            <TouchableOpacity
              key={option}
              style={[styles.segmentBtn, active && styles.segmentBtnActive]}
              onPress={() => onChange(option)}
            >
              <Text style={[styles.segmentText, active && styles.segmentTextActive]}>
                {labels[option] || option}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

function NavButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <TouchableOpacity style={styles.navBtn} onPress={onPress} activeOpacity={0.75}>
      <Text style={styles.navText}>{label}</Text>
    </TouchableOpacity>
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
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.lg,
    gap: spacing.md,
  },
  title: {
    color: colors.text,
    fontSize: 21,
    fontWeight: '800',
  },
  subtitle: {
    color: colors.textMuted,
    fontSize: 12,
    marginTop: 3,
  },
  headerBtn: {
    minHeight: 36,
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.accentStrong,
  },
  headerBtnText: {
    color: colors.white,
    fontSize: 13,
    fontWeight: '700',
  },
  summaryGrid: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  summaryItem: {
    flex: 1,
    minHeight: 72,
    borderRadius: radius.md,
    padding: spacing.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    justifyContent: 'space-between',
    ...shadow,
  },
  summaryLabel: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: '700',
  },
  summaryValue: {
    color: colors.text,
    fontSize: 20,
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
  sectionBody: {
    borderRadius: radius.md,
    backgroundColor: colors.surfaceRaised,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  controlRow: {
    minHeight: 76,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    gap: spacing.md,
  },
  controlText: {
    flex: 1,
  },
  controlLabel: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '800',
  },
  controlHint: {
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 17,
    marginTop: 4,
  },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    overflow: 'hidden',
  },
  stepBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceSoft,
  },
  stepText: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '800',
  },
  stepValue: {
    width: 38,
    color: colors.accent,
    fontSize: 15,
    fontWeight: '800',
    textAlign: 'center',
  },
  segmentRow: {
    minHeight: 64,
    padding: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    gap: spacing.sm,
  },
  segmentGroup: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  segmentBtn: {
    minHeight: 32,
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  segmentBtnActive: {
    backgroundColor: colors.accentSoft,
    borderColor: colors.accent,
  },
  segmentText: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '700',
  },
  segmentTextActive: {
    color: colors.accent,
  },
  switchRow: {
    minHeight: 76,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.md,
    gap: spacing.md,
  },
  navGrid: {
    flexDirection: 'row',
    gap: spacing.sm,
    padding: spacing.md,
  },
  navBtn: {
    flex: 1,
    minHeight: 42,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
    backgroundColor: colors.surfaceSoft,
    borderWidth: 1,
    borderColor: colors.borderStrong,
  },
  navText: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '800',
  },
});
