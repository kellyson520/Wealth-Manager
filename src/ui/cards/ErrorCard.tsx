import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { ErrorCardData } from '../../shared/types';
import { colors, radius, shadow, spacing } from '../theme';

interface ErrorCardProps {
  data: ErrorCardData;
  onRetry?: () => void;
}

const ERROR_ICONS: Record<string, string> = {
  DB_ERR: '🗄️',
  NET_ERR: '🌐',
  AUTH_ERR: '🔒',
  VALIDATION: '📋',
  UNKNOWN: '❌',
};

export default function ErrorCard({ data, onRetry }: ErrorCardProps) {
  const icon = ERROR_ICONS[data.errorCode] || ERROR_ICONS.UNKNOWN;

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Text style={styles.icon}>{icon}</Text>
        <View style={styles.headerText}>
          <Text style={styles.title}>出错了</Text>
          <Text style={styles.code}>错误代码: {data.errorCode}</Text>
        </View>
      </View>

      <Text style={styles.message}>{data.message}</Text>

      {data.detail ? (
        <Text style={styles.detail} numberOfLines={3}>
          {data.detail}
        </Text>
      ) : null}

      {data.suggestedAction ? (
        <View style={styles.suggestionRow}>
          <Text style={styles.suggestionIcon}>💡</Text>
          <Text style={styles.suggestionText}>{data.suggestedAction}</Text>
        </View>
      ) : null}

      {data.retryable && onRetry ? (
        <TouchableOpacity
          style={styles.retryBtn}
          onPress={onRetry}
          activeOpacity={0.7}
        >
          <Text style={styles.retryText}>重试</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginTop: 8,
    backgroundColor: colors.surfaceRaised,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.danger,
    padding: spacing.lg,
    ...shadow,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  icon: {
    fontSize: 24,
    marginRight: spacing.md,
  },
  headerText: {
    flex: 1,
  },
  title: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.expense,
  },
  code: {
    fontSize: 11,
    color: colors.danger,
    marginTop: 2,
  },
  message: {
    fontSize: 14,
    color: colors.text,
    lineHeight: 20,
    marginBottom: 6,
  },
  detail: {
    fontSize: 12,
    color: colors.textSubtle,
    lineHeight: 18,
    marginBottom: 8,
    backgroundColor: colors.surface,
    padding: spacing.sm,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  suggestionRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: spacing.md,
  },
  suggestionIcon: {
    fontSize: 14,
    marginRight: spacing.sm,
    marginTop: 1,
  },
  suggestionText: {
    flex: 1,
    fontSize: 13,
    color: colors.textMuted,
    lineHeight: 18,
  },
  retryBtn: {
    alignSelf: 'flex-end',
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: radius.md,
    backgroundColor: colors.danger,
  },
  retryText: {
    fontSize: 14,
    color: colors.white,
    fontWeight: '700',
  },
});
