import React from 'react';
import { Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';

interface QuickBarProps {
  onQuickAction: (text: string) => void;
}

const quickActions = [
  { label: '📊 今日概览', text: '今天花了多少' },
  { label: '📝 记账', text: '午饭花了' },
  { label: '🔍 查账单', text: '查一下账单' },
  { label: '💰 记收入', text: '收入' },
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
        >
          <Text style={styles.text}>{action.label}</Text>
        </TouchableOpacity>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#12122a',
    borderBottomWidth: 1,
    borderBottomColor: '#2a2a3e',
  },
  content: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
  },
  button: {
    backgroundColor: '#1e1e36',
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: '#3a3a5e',
  },
  text: {
    color: '#c0c0d0',
    fontSize: 13,
  },
});
