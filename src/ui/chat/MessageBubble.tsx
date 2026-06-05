import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { ChatMessage } from '../../shared/types';
import { CardRenderer } from '../cards';
import { colors, radius, shadow, spacing } from '../theme';

interface MessageBubbleProps {
  message: ChatMessage;
  onConfirm?: (actionId: string) => void;
  onCancel?: (actionId: string) => void;
  onRetry?: () => void;
  onAction?: (actionId: string) => void;
  onEdit?: () => void;
  onDelete?: () => void;
}

export default function MessageBubble({
  message,
  onConfirm,
  onCancel,
  onRetry,
  onAction,
  onEdit,
  onDelete,
}: MessageBubbleProps) {
  const isUser = message.role === 'user';
  const isSystem = message.role === 'system';
  const hasCard = !!message.data;

  if (isSystem) {
    return (
      <View style={styles.systemContainer}>
        <Text style={styles.systemText}>{message.content}</Text>
        {hasCard && (
          <CardRenderer
            data={message.data!}
            onConfirm={onConfirm}
            onCancel={onCancel}
            onRetry={onRetry}
            onAction={onAction}
            onEdit={onEdit}
            onDelete={onDelete}
          />
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
      </View>
      {hasCard && (
        <View style={styles.cardHost}>
          <CardRenderer
            data={message.data!}
            onConfirm={onConfirm}
            onCancel={onCancel}
            onRetry={onRetry}
            onAction={onAction}
            onEdit={onEdit}
            onDelete={onDelete}
          />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xs,
    maxWidth: '88%',
  },
  userContainer: {
    alignSelf: 'flex-end',
  },
  assistantContainer: {
    alignSelf: 'flex-start',
  },
  systemContainer: {
    alignSelf: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xs,
  },
  bubble: {
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
  },
  userBubble: {
    backgroundColor: colors.accentStrong,
    borderBottomRightRadius: radius.xs,
    ...shadow,
  },
  assistantBubble: {
    backgroundColor: colors.surfaceRaised,
    borderBottomLeftRadius: radius.xs,
    borderWidth: 1,
    borderColor: colors.border,
  },
  text: {
    fontSize: 15,
    lineHeight: 22,
  },
  userText: {
    color: colors.white,
  },
  assistantText: {
    color: colors.text,
  },
  systemText: {
    fontSize: 13,
    color: colors.textSubtle,
    textAlign: 'center',
  },
  cardHost: {
    marginTop: spacing.xs,
  },
});
