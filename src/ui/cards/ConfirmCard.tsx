import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { ConfirmCardData } from '../../shared/types';

interface ConfirmCardProps {
  data: ConfirmCardData;
  onConfirm?: (actionId: string) => void;
  onCancel?: (actionId: string) => void;
}

const RISK_STYLES: Record<string, { border: string; badge: string; badgeBg: string; icon: string }> = {
  low: { border: '#4ADE80', badge: '低风险', badgeBg: '#14532D', icon: '✅' },
  medium: { border: '#FACC15', badge: '中等风险', badgeBg: '#713F12', icon: '⚠️' },
  high: { border: '#F87171', badge: '高风险', badgeBg: '#7F1D1D', icon: '🚨' },
};

export default function ConfirmCard({ data, onConfirm, onCancel }: ConfirmCardProps) {
  const risk = RISK_STYLES[data.riskLevel] || RISK_STYLES.medium;
  const isSecurity = data.type === 'security_confirm_card';

  const [cooldownRemaining, setCooldownRemaining] = useState(data.cooldownSeconds || 0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!data.cooldownSeconds || data.cooldownSeconds <= 0) return;
    setCooldownRemaining(data.cooldownSeconds);
    timerRef.current = setInterval(() => {
      setCooldownRemaining((prev) => {
        if (prev <= 1) {
          if (timerRef.current) clearInterval(timerRef.current);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [data.cooldownSeconds]);

  const handleConfirm = () => {
    if (cooldownRemaining > 0) return;
    onConfirm?.(data.actionId);
  };
  const handleCancel = () => onCancel?.(data.actionId);

  return (
    <View style={[styles.card, { borderColor: risk.border }]}>
      <View style={styles.header}>
        <Text style={styles.icon}>{isSecurity ? '🔒' : risk.icon}</Text>
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
                  ? '#DC2626'
                  : isSecurity
                    ? '#4A90D9'
                    : '#4A90D9',
            },
            cooldownRemaining > 0 && styles.confirmBtnDisabled,
          ]}
          onPress={handleConfirm}
          activeOpacity={cooldownRemaining > 0 ? 1 : 0.7}
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
    backgroundColor: '#1a1a2e',
    borderRadius: 12,
    borderWidth: 2,
    padding: 14,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  icon: {
    fontSize: 24,
    marginRight: 10,
  },
  headerText: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: {
    fontSize: 15,
    fontWeight: '700',
    color: '#e0e0e0',
    flex: 1,
  },
  riskBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  riskText: {
    fontSize: 11,
    color: '#e0e0e0',
    fontWeight: '600',
  },
  message: {
    fontSize: 13,
    color: '#aaa',
    lineHeight: 20,
    marginBottom: 10,
  },
  detailBox: {
    backgroundColor: '#12122a',
    borderRadius: 8,
    padding: 10,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#2a2a4e',
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  detailLabel: {
    fontSize: 12,
    color: '#888',
  },
  detailValue: {
    fontSize: 12,
    color: '#ddd',
    fontWeight: '500',
  },
  sensitiveValue: {
    color: '#FACC15',
    letterSpacing: 1,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
  },
  cancelBtn: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#3a3a5e',
    backgroundColor: '#2a2a4e',
  },
  cancelText: {
    fontSize: 14,
    color: '#aaa',
    fontWeight: '600',
  },
  confirmBtn: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
  },
  confirmBtnDisabled: {
    opacity: 0.5,
  },
  confirmText: {
    fontSize: 14,
    color: '#fff',
    fontWeight: '700',
  },
});
