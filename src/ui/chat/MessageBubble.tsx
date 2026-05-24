import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { ChatMessage } from '../../shared/types';
import { CardRenderer } from '../cards';

interface MessageBubbleProps {
  message: ChatMessage;
  onConfirm?: (actionId: string) => void;
  onCancel?: (actionId: string) => void;
}

export default function MessageBubble({ message, onConfirm, onCancel }: MessageBubbleProps) {
  const isUser = message.role === 'user';
  const isSystem = message.role === 'system';
  const hasCard = !!message.data;

  if (isSystem) {
    return (
      <View style={styles.systemContainer}>
        <Text style={styles.systemText}>{message.content}</Text>
        {hasCard && (
          <CardRenderer data={message.data!} onConfirm={onConfirm} onCancel={onCancel} />
        )}
      </View>
    );
  }

  return (
    <View style={[styles.container, isUser ? styles.userContainer : styles.assistantContainer]}>
      <View style={[styles.bubble, isUser ? styles.userBubble : styles.assistantBubble]}>
        <Text style={[styles.text, isUser ? styles.userText : styles.assistantText]}>
          {message.content}
        </Text>
        {hasCard && (
          <CardRenderer data={message.data!} onConfirm={onConfirm} onCancel={onCancel} />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingVertical: 6,
    maxWidth: '85%',
  },
  userContainer: {
    alignSelf: 'flex-end',
  },
  assistantContainer: {
    alignSelf: 'flex-start',
  },
  systemContainer: {
    alignSelf: 'center',
    paddingHorizontal: 16,
    paddingVertical: 4,
  },
  bubble: {
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  userBubble: {
    backgroundColor: '#4A90D9',
    borderBottomRightRadius: 4,
  },
  assistantBubble: {
    backgroundColor: '#2a2a3e',
    borderBottomLeftRadius: 4,
    borderWidth: 1,
    borderColor: '#3a3a5e',
  },
  text: {
    fontSize: 15,
    lineHeight: 22,
  },
  userText: {
    color: '#ffffff',
  },
  assistantText: {
    color: '#e0e0e0',
  },
  systemText: {
    fontSize: 13,
    color: '#888',
    textAlign: 'center',
  },
});
