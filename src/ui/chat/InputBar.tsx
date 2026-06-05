import React, { useState } from 'react';
import {
  View,
  TextInput,
  TouchableOpacity,
  Text,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { colors, radius, spacing } from '../theme';

interface InputBarProps {
  onSend: (text: string) => void;
  onVoice?: () => void;
  onAttachment?: () => void;
  onOCR?: () => void;
  disabled?: boolean;
}

export default function InputBar({ onSend, onVoice, onAttachment, onOCR, disabled }: InputBarProps) {
  const [text, setText] = useState('');

  const handleSend = () => {
    const trimmed = text.trim();
    if (trimmed && !disabled) {
      onSend(trimmed);
      setText('');
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.container}
    >
      {(onVoice || onAttachment || onOCR) && (
      <View style={styles.actionRow}>
        {onVoice && (
          <TouchableOpacity
            style={[styles.actionBtn, disabled && styles.actionDisabled]}
            onPress={onVoice}
            disabled={disabled}
            activeOpacity={0.65}
          >
            <Text style={styles.actionIcon}>🎙</Text>
          </TouchableOpacity>
        )}
        {onAttachment && (
          <TouchableOpacity
            style={[styles.actionBtn, disabled && styles.actionDisabled]}
            onPress={onAttachment}
            disabled={disabled}
            activeOpacity={0.65}
          >
            <Text style={styles.actionIcon}>⌁</Text>
          </TouchableOpacity>
        )}
        {onOCR && (
          <TouchableOpacity
            style={[styles.actionBtn, disabled && styles.actionDisabled]}
            onPress={onOCR}
            disabled={disabled}
            activeOpacity={0.65}
          >
            <Text style={styles.actionIcon}>▣</Text>
          </TouchableOpacity>
        )}
      </View>
      )}
      <View style={styles.inputRow}>
        <TextInput
          style={styles.input}
          value={text}
          onChangeText={setText}
          placeholder="输入记账内容，如「午饭花了35块」"
          placeholderTextColor={colors.textSubtle}
          multiline
          maxLength={200}
          returnKeyType="send"
          onSubmitEditing={handleSend}
          editable={!disabled}
        />
        <TouchableOpacity
          style={[styles.sendButton, (!text.trim() || disabled) && styles.sendDisabled]}
          onPress={handleSend}
          disabled={!text.trim() || disabled}
          activeOpacity={0.7}
        >
          <Text style={styles.sendText}>↑</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.bgAlt,
    paddingBottom: spacing.sm,
  },
  actionRow: {
    flexDirection: 'row',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xs,
    gap: spacing.sm,
  },
  actionBtn: {
    width: 36,
    height: 36,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceRaised,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  actionDisabled: {
    opacity: 0.45,
  },
  actionIcon: {
    fontSize: 16,
    color: colors.text,
    fontWeight: '800',
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: spacing.md,
    paddingTop: spacing.xs,
  },
  input: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.lg,
    paddingVertical: Platform.OS === 'ios' ? 12 : 10,
    fontSize: 15,
    color: colors.text,
    maxHeight: 100,
  },
  sendButton: {
    marginLeft: spacing.sm,
    width: 44,
    height: 44,
    borderRadius: radius.lg,
    backgroundColor: colors.accentStrong,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendDisabled: {
    backgroundColor: colors.surfaceSoft,
    opacity: 0.7,
  },
  sendText: {
    color: colors.white,
    fontSize: 24,
    lineHeight: 24,
    fontWeight: '800',
  },
});
