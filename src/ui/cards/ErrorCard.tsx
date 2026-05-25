import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { ErrorCardData } from '../../shared/types';

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
    backgroundColor: '#1a1a2e',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#7F1D1D',
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
  },
  title: {
    fontSize: 15,
    fontWeight: '700',
    color: '#F87171',
  },
  code: {
    fontSize: 11,
    color: '#B91C1C',
    marginTop: 2,
  },
  message: {
    fontSize: 14,
    color: '#ddd',
    lineHeight: 20,
    marginBottom: 6,
  },
  detail: {
    fontSize: 12,
    color: '#888',
    lineHeight: 18,
    marginBottom: 8,
    backgroundColor: '#12122a',
    padding: 8,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#2a2a2e',
  },
  suggestionRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 10,
  },
  suggestionIcon: {
    fontSize: 14,
    marginRight: 6,
    marginTop: 1,
  },
  suggestionText: {
    flex: 1,
    fontSize: 13,
    color: '#aaa',
    lineHeight: 18,
  },
  retryBtn: {
    alignSelf: 'flex-end',
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#DC2626',
  },
  retryText: {
    fontSize: 14,
    color: '#fff',
    fontWeight: '700',
  },
});
