import React from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { colors, radius, spacing } from '../theme';

interface ToolCallBubbleProps {
  toolName: string;
  toolArgs?: Record<string, unknown>;
  status: 'pending' | 'running' | 'success' | 'error';
  result?: string;
  error?: string;
}

export default function ToolCallBubble({ toolName, toolArgs, status, result, error }: ToolCallBubbleProps) {
  const statusColor = status === 'success' ? colors.income : status === 'error' ? colors.danger : status === 'running' ? colors.warning : colors.textSubtle;
  const statusLabel = status === 'pending' ? '等待' : status === 'running' ? '执行中' : status === 'success' ? '完成' : '失败';

  const argPreview = toolArgs ? Object.entries(toolArgs).slice(0, 3).map(([k, v]) => `${String(k)}=${String(v).slice(0, 20)}`).join(', ') : '';

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={[styles.dot, { backgroundColor: statusColor }]} />
        <Text style={styles.toolName}>{toolName}</Text>
        {status === 'running' && <ActivityIndicator size="small" color={colors.warning} style={styles.spinner} />}
        <View style={[styles.badge, { backgroundColor: statusColor + '22' }]}>
          <Text style={[styles.badgeText, { color: statusColor }]}>{statusLabel}</Text>
        </View>
      </View>
      {argPreview ? <Text style={styles.args}>{argPreview}</Text> : null}
      {result ? <Text style={styles.result}>{result.slice(0, 200)}</Text> : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    marginVertical: 4,
    borderLeftWidth: 3,
    borderLeftColor: colors.accent,
    borderWidth: 1,
    borderColor: colors.border,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: spacing.sm,
  },
  toolName: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '700',
    flex: 1,
  },
  spinner: {
    marginLeft: 8,
  },
  badge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radius.xs,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '500',
  },
  args: {
    color: colors.textSubtle,
    fontSize: 11,
    marginTop: 4,
    marginLeft: 16,
  },
  result: {
    color: colors.textMuted,
    fontSize: 11,
    marginTop: 6,
    marginLeft: 16,
  },
  error: {
    color: colors.danger,
    fontSize: 11,
    marginTop: 4,
    marginLeft: 16,
  },
});
