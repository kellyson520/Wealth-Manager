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
      <View style={styles.actionRow}>
        {onVoice && (
          <TouchableOpacity style={styles.actionBtn} onPress={onVoice} disabled={disabled}>
            <Text style={styles.actionIcon}>{'\uD83C\uDF99'}</Text>
          </TouchableOpacity>
        )}
        {onAttachment && (
          <TouchableOpacity style={styles.actionBtn} onPress={onAttachment} disabled={disabled}>
            <Text style={styles.actionIcon}>{'\uD83D\uDCCE'}</Text>
          </TouchableOpacity>
        )}
        {onOCR && (
          <TouchableOpacity style={styles.actionBtn} onPress={onOCR} disabled={disabled}>
            <Text style={styles.actionIcon}>{'\uD83D\uDCF7'}</Text>
          </TouchableOpacity>
        )}
        <View style={{ flex: 1 }} />
      </View>
      <View style={styles.inputRow}>
        <TextInput
          style={styles.input}
          value={text}
          onChangeText={setText}
          placeholder="输入记账内容，如「午饭花了35块」"
          placeholderTextColor="#666"
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
        >
          <Text style={styles.sendText}>发送</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    borderTopWidth: 1,
    borderTopColor: '#2a2a3e',
    backgroundColor: '#12122a',
    paddingBottom: 8,
  },
  actionRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 2,
  },
  actionBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#1e1e36',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
  },
  actionIcon: {
    fontSize: 16,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 12,
    paddingTop: 4,
  },
  input: {
    flex: 1,
    backgroundColor: '#1e1e36',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 15,
    color: '#e0e0e0',
    maxHeight: 100,
  },
  sendButton: {
    marginLeft: 8,
    backgroundColor: '#4A90D9',
    borderRadius: 20,
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  sendDisabled: {
    backgroundColor: '#2a2a4e',
  },
  sendText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
});
