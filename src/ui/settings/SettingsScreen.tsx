import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import {
  ActivityIndicator,
  Alert,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import type { PersonaParams, UserPreferences } from '../../shared/types';
import {
  getPersonaSnapshot,
  isNluLearningEnabled,
  listPersonaSnapshots,
  listAiMemories,
  PersonaSnapshot,
  rollbackPersonaSnapshot,
  setNluLearningEnabled,
  updatePersonaSnapshot,
} from '../../core/memory/adaptive-context';
import { getPromptCacheDashboard } from '../../core/cloud/prompt-cache';
import { DatabaseSecurityStatus, getDatabaseSecurityStatus } from '../../core/database/database';
import { loadPersona, setPersonaParams, setPreferences } from '../../core/persona/persona-engine';
import { approveNluLearningCandidate, listNluLearningCandidates, NluLearningSample } from '../../agents/master/nlu-learning';
import { colors, radius, shadow, spacing } from '../theme';
import AppShell from '../layout/AppShell';

type SettingsState = {
  personaParams: PersonaParams;
  preferences: UserPreferences;
  learningEnabled: boolean;
  personaVersion: number;
  soul: string;
  toneRulesText: string;
  boundariesText: string;
  memoryCount: number;
  cacheHitRate: number;
  databaseSecurity: DatabaseSecurityStatus | null;
  personaHistory: PersonaSnapshot[];
  nluCandidates: NluLearningSample[];
};

const DEFAULT_STATE: SettingsState = {
  personaParams: { rigor: 5, humor: 5, proactivity: 5 },
  preferences: { currency: 'CNY', language: 'zh-Hans', theme: 'dark', firstDayOfWeek: 1 },
  learningEnabled: true,
  personaVersion: 1,
  soul: '',
  toneRulesText: '',
  boundariesText: '',
  memoryCount: 0,
  cacheHitRate: 0,
  databaseSecurity: null,
  personaHistory: [],
  nluCandidates: [],
};

const PERSONA_CONTROLS: { key: keyof PersonaParams; label: string; hint: string }[] = [
  { key: 'rigor', label: '严谨', hint: '分类、金额、确认话术更审慎' },
  { key: 'humor', label: '轻松', hint: '回复更自然，但不牺牲准确性' },
  { key: 'proactivity', label: '主动', hint: '更积极给出提醒、预算和复盘' },
];

export default function SettingsScreen() {
  const [state, setState] = useState<SettingsState>(DEFAULT_STATE);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [savingKey, setSavingKey] = useState<string | null>(null);

  const refresh = useCallback(async (silent = false) => {
    if (silent) setRefreshing(true);
    else setLoading(true);
    try {
      const [persona, snapshot, learningEnabled, memories, cache, databaseSecurity, personaHistory, nluCandidates] = await Promise.all([
        loadPersona(),
        getPersonaSnapshot(),
        isNluLearningEnabled(),
        listAiMemories({ limit: 80 }),
        getPromptCacheDashboard({ limit: 40 }),
        getDatabaseSecurityStatus(),
        listPersonaSnapshots(6),
        listNluLearningCandidates(6),
      ]);
      setState({
        personaParams: persona.personaParams,
        preferences: persona.preferences,
        learningEnabled,
        personaVersion: snapshot.version,
        soul: snapshot.soul,
        toneRulesText: snapshot.toneRules.join('\n'),
        boundariesText: snapshot.boundaries.join('\n'),
        memoryCount: memories.length,
        cacheHitRate: cache.overall.averageHitRate,
        databaseSecurity,
        personaHistory,
        nluCandidates,
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

  const savePersonaSnapshot = useCallback(async () => {
    const nextVersion = state.personaVersion + 1;
    const confirmed = await confirmAction(
      '保存人格',
      `将创建 v${nextVersion} 人格快照，并影响后续 prompt cache。`
    );
    if (!confirmed) return;
    setSavingKey('snapshot');
    try {
      const snapshot = await updatePersonaSnapshot({
        soul: state.soul,
        toneRules: splitLines(state.toneRulesText),
        boundaries: splitLines(state.boundariesText),
        source: 'settings',
      });
      setState((prev) => ({
        ...prev,
        personaVersion: snapshot.version,
        soul: snapshot.soul,
        toneRulesText: snapshot.toneRules.join('\n'),
        boundariesText: snapshot.boundaries.join('\n'),
      }));
    } catch (e) {
      Alert.alert('保存失败', e instanceof Error ? e.message : '人格设置保存失败');
    } finally {
      setSavingKey(null);
    }
  }, [state.boundariesText, state.personaVersion, state.soul, state.toneRulesText]);

  const rollbackPersona = useCallback(async (version: number) => {
    const confirmed = await confirmAction('回滚人格', `将基于 v${version} 创建新的当前人格快照。`);
    if (!confirmed) return;
    setSavingKey(`rollback:${version}`);
    try {
      const snapshot = await rollbackPersonaSnapshot(version);
      setState((prev) => ({
        ...prev,
        personaVersion: snapshot.version,
        soul: snapshot.soul,
        toneRulesText: snapshot.toneRules.join('\n'),
        boundariesText: snapshot.boundaries.join('\n'),
      }));
      await refresh(true);
    } catch (e) {
      Alert.alert('回滚失败', e instanceof Error ? e.message : '人格版本回滚失败');
    } finally {
      setSavingKey(null);
    }
  }, [refresh]);

  const approveCandidate = useCallback(async (id: string) => {
    setSavingKey(`nlu:${id}`);
    try {
      await approveNluLearningCandidate(id);
      await refresh(true);
    } finally {
      setSavingKey(null);
    }
  }, [refresh]);

  if (loading) {
    return (
      <AppShell>
        <View style={styles.loading}>
          <ActivityIndicator color={colors.accent} />
          <Text style={styles.loadingText}>加载设置</Text>
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
            <Text style={styles.title}>设置</Text>
            <Text style={styles.subtitle}>人格 · 记忆 · 学习 · 运行</Text>
          </View>
        </View>

        <View style={styles.summaryGrid}>
          <SummaryItem label="人格版本" value={`v${state.personaVersion}`} />
          <SummaryItem label="AI记忆" value={`${state.memoryCount}`} />
          <SummaryItem label="缓存命中" value={`${Math.round(state.cacheHitRate * 10) / 10}%`} valueColor={cacheTone} />
          <SummaryItem
            label="数据库"
            value={state.databaseSecurity?.encryptionActive ? '加密' : '明文'}
            valueColor={state.databaseSecurity?.encryptionActive ? colors.income : colors.warning}
          />
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

        <Section title="人格定义">
          <View style={styles.editorBlock}>
            <Text style={styles.controlLabel}>SOUL</Text>
            <TextInput
              style={[styles.textInput, styles.soulInput]}
              value={state.soul}
              onChangeText={(soul) => setState((prev) => ({ ...prev, soul }))}
              multiline
              textAlignVertical="top"
              placeholder="稳定身份、目标和约束"
              placeholderTextColor={colors.textSubtle}
            />
          </View>
          <View style={styles.editorBlock}>
            <Text style={styles.controlLabel}>语气规则</Text>
            <TextInput
              style={styles.textInput}
              value={state.toneRulesText}
              onChangeText={(toneRulesText) => setState((prev) => ({ ...prev, toneRulesText }))}
              multiline
              textAlignVertical="top"
              placeholder="每行一条"
              placeholderTextColor={colors.textSubtle}
            />
          </View>
          <View style={styles.editorBlock}>
            <Text style={styles.controlLabel}>边界规则</Text>
            <TextInput
              style={styles.textInput}
              value={state.boundariesText}
              onChangeText={(boundariesText) => setState((prev) => ({ ...prev, boundariesText }))}
              multiline
              textAlignVertical="top"
              placeholder="每行一条"
              placeholderTextColor={colors.textSubtle}
            />
          </View>
          <View style={styles.saveRow}>
            <TouchableOpacity
              style={[styles.saveBtn, savingKey === 'snapshot' && styles.saveBtnDisabled]}
              onPress={savePersonaSnapshot}
              disabled={savingKey === 'snapshot'}
            >
              <Text style={styles.saveText}>{savingKey === 'snapshot' ? '保存中' : '保存人格'}</Text>
            </TouchableOpacity>
          </View>
        </Section>

        <Section title="人格版本">
          {state.personaHistory.map((snapshot) => (
            <View key={snapshot.id} style={styles.versionRow}>
              <View style={styles.controlText}>
                <Text style={styles.controlLabel}>v{snapshot.version} · {snapshot.source}</Text>
                <Text style={styles.controlHint} numberOfLines={2}>{snapshot.soul}</Text>
              </View>
              <TouchableOpacity
                style={styles.smallActionBtn}
                onPress={() => rollbackPersona(snapshot.version)}
                disabled={snapshot.version === state.personaVersion || savingKey === `rollback:${snapshot.version}`}
              >
                <Text style={styles.smallActionText}>
                  {snapshot.version === state.personaVersion ? '当前' : '回滚'}
                </Text>
              </TouchableOpacity>
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
          {state.nluCandidates.map((candidate) => (
            <View key={candidate.id} style={styles.versionRow}>
              <View style={styles.controlText}>
                <Text style={styles.controlLabel}>{candidate.text}{' -> '}{candidate.intent}</Text>
                <Text style={styles.controlHint}>hits {candidate.hits} · {candidate.source}</Text>
              </View>
              <TouchableOpacity
                style={styles.smallActionBtn}
                onPress={() => approveCandidate(candidate.id)}
                disabled={savingKey === `nlu:${candidate.id}`}
              >
                <Text style={styles.smallActionText}>批准</Text>
              </TouchableOpacity>
            </View>
          ))}
        </Section>

        <Section title="安全">
          <View style={styles.securityRow}>
            <View style={styles.controlText}>
              <Text style={styles.controlLabel}>SQLite 文件加密</Text>
              <Text style={styles.controlHint}>
                {state.databaseSecurity?.warning || '数据库安全状态正常'}
              </Text>
            </View>
            <View style={[
              styles.securityBadge,
              state.databaseSecurity?.encryptionActive ? styles.securityBadgeOk : styles.securityBadgeWarn,
            ]}>
              <Text style={styles.securityBadgeText}>
                {state.databaseSecurity?.mode || 'unknown'}
              </Text>
            </View>
          </View>
        </Section>

      </ScrollView>
    </AppShell>
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

function splitLines(text: string): string[] {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

function confirmAction(title: string, message: string): Promise<boolean> {
  return new Promise((resolve) => {
    Alert.alert(title, message, [
      { text: '取消', style: 'cancel', onPress: () => resolve(false) },
      { text: '确认', onPress: () => resolve(true) },
    ]);
  });
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
  summaryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  summaryItem: {
    flex: 1,
    minWidth: 118,
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
  securityRow: {
    minHeight: 76,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.md,
    gap: spacing.md,
  },
  securityBadge: {
    minHeight: 32,
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  securityBadgeOk: {
    backgroundColor: colors.incomeSoft,
    borderColor: colors.income,
  },
  securityBadgeWarn: {
    backgroundColor: colors.warningSoft,
    borderColor: colors.warning,
  },
  securityBadgeText: {
    color: colors.text,
    fontSize: 12,
    fontWeight: '800',
  },
  editorBlock: {
    padding: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    gap: spacing.sm,
  },
  textInput: {
    minHeight: 92,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surface,
    color: colors.text,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: 13,
    lineHeight: 18,
  },
  soulInput: {
    minHeight: 132,
  },
  saveRow: {
    padding: spacing.md,
    alignItems: 'flex-end',
  },
  saveBtn: {
    minHeight: 38,
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    borderRadius: radius.md,
    backgroundColor: colors.accentStrong,
  },
  saveBtnDisabled: {
    backgroundColor: colors.surfaceSoft,
  },
  saveText: {
    color: colors.white,
    fontSize: 13,
    fontWeight: '800',
  },
  versionRow: {
    minHeight: 76,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    gap: spacing.md,
  },
  smallActionBtn: {
    minHeight: 32,
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceSoft,
    borderWidth: 1,
    borderColor: colors.borderStrong,
  },
  smallActionText: {
    color: colors.text,
    fontSize: 12,
    fontWeight: '800',
  },
});
