import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { TipCardData } from '../../shared/types';
import { colors, radius, shadow, spacing } from '../theme';

interface TipCardProps {
  data: TipCardData;
  onAction?: (actionId: string) => void;
}

const TIP_ICONS: Record<string, string> = {
  budget: '💰',
  saving: '🐷',
  habit: '📊',
  security: '🔒',
  general: '💡',
};

const TIP_COLORS: Record<string, string> = {
  budget: colors.income,
  saving: colors.purple,
  habit: colors.accent,
  security: colors.warning,
  general: colors.info,
};

export default function TipCard({ data, onAction }: TipCardProps) {
  const icon = TIP_ICONS[data.tipType] || TIP_ICONS.general;
  const color = TIP_COLORS[data.tipType] || TIP_COLORS.general;

  return (
    <View style={[styles.card, { borderColor: color }]}>
      <View style={styles.header}>
        <Text style={styles.icon}>{icon}</Text>
        <Text style={[styles.title, { color }]}>{data.title}</Text>
      </View>

      <Text style={styles.message}>{data.message}</Text>

      {data.actionLabel && data.actionId ? (
        <TouchableOpacity
          style={[styles.actionBtn, { backgroundColor: color }]}
          onPress={() => onAction?.(data.actionId!)}
          activeOpacity={0.7}
        >
          <Text style={styles.actionText}>{data.actionLabel}</Text>
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
    borderWidth: 1.5,
    borderLeftWidth: 4,
    padding: spacing.lg,
    ...shadow,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  icon: {
    fontSize: 20,
    marginRight: spacing.sm,
  },
  title: {
    fontSize: 15,
    fontWeight: '700',
  },
  message: {
    fontSize: 13,
    color: colors.textMuted,
    lineHeight: 20,
    marginBottom: 10,
  },
  actionBtn: {
    alignSelf: 'flex-start',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: radius.md,
  },
  actionText: {
    fontSize: 13,
    color: colors.white,
    fontWeight: '700',
  },
});
