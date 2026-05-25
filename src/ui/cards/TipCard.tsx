import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { TipCardData } from '../../shared/types';

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
  budget: '#4ADE80',
  saving: '#A78BFA',
  habit: '#4A90D9',
  security: '#FACC15',
  general: '#F87171',
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
    backgroundColor: '#1a1a2e',
    borderRadius: 12,
    borderWidth: 1.5,
    borderLeftWidth: 4,
    padding: 14,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  icon: {
    fontSize: 20,
    marginRight: 8,
  },
  title: {
    fontSize: 15,
    fontWeight: '700',
  },
  message: {
    fontSize: 13,
    color: '#bbb',
    lineHeight: 20,
    marginBottom: 10,
  },
  actionBtn: {
    alignSelf: 'flex-start',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  actionText: {
    fontSize: 13,
    color: '#fff',
    fontWeight: '700',
  },
});
