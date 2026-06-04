import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  SafeAreaView,
  StatusBar,
  TouchableOpacity,
} from 'react-native';
import { useRouter } from 'expo-router';
import MessageBubble from './MessageBubble';
import InputBar from './InputBar';
import QuickBar from './QuickBar';
import { ChatMessage } from '../../shared/types';
import { processMessage } from '../../agents/master/master.agent';
import { logger, captureError } from '../../core/logger/logger';

const WELCOME_MESSAGE: ChatMessage = {
  id: 'welcome',
  role: 'assistant',
  content: 'Hello! I am **Wealth Manager**\n\nYour AI financial assistant. Tell me about your income and expenses in natural language!\n\nExamples:\n- "Spent 35 on lunch"\n- "How much did I spend today?"\n- "Salary 5000 received"',
  timestamp: new Date().toISOString(),
};

export default function ChatScreen() {
  const [messages, setMessages] = useState<ChatMessage[]>([WELCOME_MESSAGE]);
  const [isProcessing, setIsProcessing] = useState(false);
  const flatListRef = useRef<FlatList>(null);
  const router = useRouter();

  useEffect(() => {
    const originalHandler = ErrorUtils.getGlobalHandler?.();
    if (originalHandler) {
      ErrorUtils.setGlobalHandler((error: Error, isFatal?: boolean) => {
        captureError('Global', error, isFatal ? 'Fatal unhandled error' : 'Unhandled error');
        logger.fatal('Global', `App ${isFatal ? 'crash' : 'error'}: ${error.message}`, error.stack);
        originalHandler(error, isFatal);
      });
    }
    logger.info('App', 'Application started');
  }, []);

  const addMessage = useCallback((msg: ChatMessage) => {
    setMessages((prev) => [...prev, msg]);
    setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
  }, []);

  const handleSend = useCallback(
    async (text: string) => {
      const userMsg: ChatMessage = {
        id: `u_${Date.now()}`,
        role: 'user',
        content: text,
        timestamp: new Date().toISOString(),
      };
      addMessage(userMsg);
      setIsProcessing(true);

      try {
	        logger.info('Chat', `User message received (${text.length} chars, hash ${hashForLog(text)})`);
        const result = await processMessage(text);
        addMessage(result.reply);
        logger.info('Chat', `Reply generated, length: ${result.reply.content.length}`);
      } catch (e) {
        captureError('Chat', e, 'processMessage failed');
        addMessage({
          id: `err_${Date.now()}`,
          role: 'assistant',
          content: '处理您的消息时出错了，请重试。',
          timestamp: new Date().toISOString(),
        });
      } finally {
        setIsProcessing(false);
      }
    },
    [addMessage]
  );

  const handleCardConfirm = useCallback(
    (actionId: string) => {
      logger.info('Chat', `Card confirmed: ${actionId}`);
      handleSend(`确认操作 ${actionId}`);
    },
    [handleSend]
  );

  const handleCardCancel = useCallback(
    (actionId: string) => {
      logger.info('Chat', `Card cancelled: ${actionId}`);
      addMessage({
        id: `sys_${Date.now()}`,
        role: 'system',
        content: '操作已取消',
        timestamp: new Date().toISOString(),
      });
    },
    [addMessage]
  );

  const renderItem = useCallback(
    ({ item }: { item: ChatMessage }) => (
      <MessageBubble
        message={item}
        onConfirm={handleCardConfirm}
        onCancel={handleCardCancel}
      />
    ),
    [handleCardConfirm, handleCardCancel]
  );

  const keyExtractor = useCallback((item: ChatMessage) => item.id, []);

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#0a0a1a" />
      <View style={styles.header}>
        <View style={styles.headerContent}>
          <View style={styles.avatar}>
            <View style={styles.avatarDot} />
          </View>
          <View style={{ flex: 1 }}>
            <View style={styles.titleRow}>
              <View style={styles.statusDot} />
              <Text style={styles.title}>Wealth Manager</Text>
            </View>
            <Text style={styles.subtitle}>AI 财务助手</Text>
          </View>
          <TouchableOpacity
            style={styles.logBtn}
            onPress={() => router.push('/log')}
            activeOpacity={0.7}
          >
            <Text style={styles.logBtnText}>日志</Text>
          </TouchableOpacity>
        </View>
      </View>

      <FlatList
        ref={flatListRef}
        data={messages}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        style={styles.messageList}
        contentContainerStyle={styles.messageListContent}
        onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
      />

      <QuickBar onQuickAction={handleSend} />
      <InputBar
        onSend={handleSend}
        disabled={isProcessing}
        onVoice={() => handleSend('语音记账')}
        onOCR={() => handleSend('OCR导入小票')}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a1a',
  },
  header: {
    backgroundColor: '#12122a',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#2a2a3e',
  },
  headerContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#1e1e3e',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  avatarDot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#4A90D9',
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#4ADE80',
    marginRight: 8,
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
    color: '#e0e0e0',
  },
  subtitle: {
    fontSize: 12,
    color: '#888',
    marginTop: 2,
  },
  logBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: '#1e1e3e',
    borderWidth: 1,
    borderColor: '#3a3a5e',
  },
  logBtnText: {
    fontSize: 12,
    color: '#aaa',
    fontWeight: '500',
  },
  messageList: {
    flex: 1,
  },
  messageListContent: {
    paddingVertical: 12,
  },
});

function hashForLog(text: string): string {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}
