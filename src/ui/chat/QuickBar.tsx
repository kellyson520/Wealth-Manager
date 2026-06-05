import React from 'react';
import { Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { colors, radius, spacing } from '../theme';

interface QuickBarProps {
  onQuickAction: (text: string) => void;
}

const quickActions = [
  { icon: '+', label: '记支出', text: '午饭花了' },
  { icon: '¥', label: '记收入', text: '工资到账' },
  { icon: '↗', label: '趋势', text: '这个月消费趋势，给个图' },
  { icon: '!', label: '异常', text: '我最近是不是有异常消费' },
  { icon: '↻', label: '订阅', text: '哪些订阅还在扣费' },
];

export default function QuickBar({ onQuickAction }: QuickBarProps) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.container}
      contentContainerStyle={styles.content}
    >
      {quickActions.map((action, index) => (
        <TouchableOpacity
          key={index}
          style={styles.button}
          onPress={() => onQuickAction(action.text)}
          activeOpacity={0.65}
        >
          <Text style={styles.icon}>{action.icon}</Text>
          <Text style={styles.text}>{action.label}</Text>
        </TouchableOpacity>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.bgAlt,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  content: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: spacing.sm,
  },
  button: {
    minHeight: 36,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.pill,
    paddingLeft: spacing.sm,
    paddingRight: spacing.md,
    paddingVertical: spacing.xs,
    borderWidth: 1,
    borderColor: colors.border,
  },
  icon: {
    width: 22,
    height: 22,
    borderRadius: 11,
    marginRight: spacing.xs,
    textAlign: 'center',
    color: colors.accent,
    backgroundColor: colors.accentSoft,
    fontSize: 13,
    lineHeight: 22,
    fontWeight: '800',
  },
  text: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: '700',
  },
});
