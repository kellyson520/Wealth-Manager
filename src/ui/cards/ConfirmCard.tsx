import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { ConfirmCardData } from '../../shared/types';
import { colors, radius, shadow, spacing } from '../theme';

interface ConfirmCardProps {
  data: ConfirmCardData;
  onConfirm?: (actionId: string) => void;
  onCancel?: (actionId: string) => void;
}

const RISK_STYLES: Record<string, { border: string; badge: string; badgeBg: string; icon: string }> = {
  low: { border: colors.income, badge: '低风险', badgeBg: colors.incomeSoft, icon: '✓' },
  medium: { border: colors.warning, badge: '中等风险', badgeBg: colors.warningSoft, icon: '!' },
  high: { border: colors.expense, badge: '高风险', badgeBg: colors.dangerSoft, icon: '!' },
};

export default function ConfirmCard({ data, onConfirm, onCancel }: ConfirmCardProps) {
  const risk = RISK_STYLES[data.riskLevel] || RISK_STYLES.medium;
  const isSecurity = data.type === 'security_confirm_card';

  const [cooldownRemaining, setCooldownRemaining] = useState(data.cooldownSeconds || 0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    if (!data.cooldownSeconds || data.cooldownSeconds <= 0) {
      setCooldownRemaining(0);
      return;
    }

    setCooldownRemaining(data.cooldownSeconds);
    const intervalId = setInterval(() => {
      setCooldownRemaining((prev) => {
        if (prev <= 1) {
          clearInterval(intervalId);
          if (timerRef.current === intervalId) timerRef.current = null;
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    timerRef.current = intervalId;

    return () => {
      clearInterval(intervalId);
      if (timerRef.current === intervalId) timerRef.current = null;
    };
  }, [data.actionId, data.cooldownSeconds]);

  const handleConfirm = () => {
    if (cooldownRemaining > 0) return;
    onConfirm?.(data.actionId);
  };
  const handleCancel = () => onCancel?.(data.actionId);

  return (
    <View style={[styles.card, { borderColor: risk.border }]}>
      <View style={styles.header}>
        <View style={[styles.iconWrap, { borderColor: risk.border }]}>
          <Text style={[styles.icon, { color: risk.border }]}>{isSecurity ? '⌁' : risk.icon}</Text>
        </View>
        <View style={styles.headerText}>
          <Text style={styles.title}>{data.title}</Text>
          <View style={[styles.riskBadge, { backgroundColor: risk.badgeBg }]}>
            <Text style={styles.riskText}>{risk.badge}</Text>
          </View>
        </View>
      </View>

      <Text style={styles.message}>{data.message}</Text>

      {isSecurity && data.detailItems && data.detailItems.length > 0 ? (
        <View style={styles.detailBox}>
          {data.detailItems.map((item, idx) => (
            <View key={idx} style={styles.detailRow}>
              <Text style={styles.detailLabel}>{item.label}</Text>
              <Text style={[styles.detailValue, item.isSensitive && styles.sensitiveValue]}>
                {item.isSensitive ? '••••••••' : item.value}
              </Text>
            </View>
          ))}
        </View>
      ) : null}

      <View style={styles.actions}>
        <TouchableOpacity
          style={styles.cancelBtn}
          onPress={handleCancel}
          activeOpacity={0.7}
        >
          <Text style={styles.cancelText}>{data.cancelLabel || '取消'}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            styles.confirmBtn,
            {
              backgroundColor:
                data.riskLevel === 'high'
                  ? colors.danger
                  : isSecurity
                    ? colors.accentStrong
                    : colors.accentStrong,
            },
            cooldownRemaining > 0 && styles.confirmBtnDisabled,
          ]}
          onPress={handleConfirm}
          activeOpacity={cooldownRemaining > 0 ? 1 : 0.65}
          disabled={cooldownRemaining > 0}
        >
          <Text style={styles.confirmText}>
            {cooldownRemaining > 0
              ? `${data.confirmLabel || '确认'} (${cooldownRemaining}s)`
              : data.confirmLabel || '确认'}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginTop: 8,
    backgroundColor: colors.surfaceRaised,
    borderRadius: radius.md,
    borderWidth: 2,
    padding: spacing.lg,
    ...shadow,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  iconWrap: {
    width: 34,
    height: 34,
    borderRadius: radius.md,
    borderWidth: 1,
    backgroundColor: colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing.md,
  },
  icon: {
    fontSize: 18,
    fontWeight: '900',
  },
  headerText: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  title: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text,
    flex: 1,
  },
  riskBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radius.sm,
  },
  riskText: {
    fontSize: 11,
    color: colors.text,
    fontWeight: '800',
  },
  message: {
    fontSize: 13,
    color: colors.textMuted,
    lineHeight: 20,
    marginBottom: spacing.md,
  },
  detailBox: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  detailLabel: {
    fontSize: 12,
    color: colors.textSubtle,
  },
  detailValue: {
    fontSize: 12,
    color: colors.text,
    fontWeight: '500',
  },
  sensitiveValue: {
    color: colors.warning,
    letterSpacing: 1,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: spacing.sm,
  },
  cancelBtn: {
    minHeight: 40,
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: 10,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surfaceSoft,
  },
  cancelText: {
    fontSize: 14,
    color: colors.textMuted,
    fontWeight: '700',
  },
  confirmBtn: {
    minHeight: 40,
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: 10,
    borderRadius: radius.md,
  },
  confirmBtnDisabled: {
    opacity: 0.5,
  },
  confirmText: {
    fontSize: 14,
    color: colors.white,
    fontWeight: '700',
  },
});
