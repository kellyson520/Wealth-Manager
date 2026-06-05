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
import { colors, radius, shadow, spacing } from '../theme';

const WELCOME_MESSAGE: ChatMessage = {
  id: 'welcome',
  role: 'assistant',
  content: '你好，我是 Wealth Manager。直接告诉我一笔收支，或问我预算、趋势、异常消费和订阅扣费。',
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
      <StatusBar barStyle="light-content" backgroundColor={colors.bg} />
      <View style={styles.header}>
        <View style={styles.headerContent}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>¥</Text>
          </View>
          <View style={{ flex: 1 }}>
            <View style={styles.titleRow}>
              <View style={styles.statusDot} />
              <Text style={styles.title}>Wealth Manager</Text>
            </View>
            <View style={styles.contextRow}>
              <Text style={styles.contextChip}>本地优先</Text>
              <Text style={styles.contextDivider}>·</Text>
              <Text style={styles.subtitle}>AI 财务助手</Text>
            </View>
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
        ListFooterComponent={
          isProcessing ? (
            <View style={styles.processingRow}>
              <View style={styles.processingDot} />
              <Text style={styles.processingText}>正在分析</Text>
            </View>
          ) : null
        }
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
    backgroundColor: colors.bg,
  },
  header: {
    backgroundColor: colors.bgAlt,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatar: {
    width: 42,
    height: 42,
    borderRadius: radius.lg,
    backgroundColor: colors.accentSoft,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing.md,
    borderWidth: 1,
    borderColor: 'rgba(45,212,191,0.35)',
    ...shadow,
  },
  avatarText: {
    color: colors.accent,
    fontSize: 22,
    fontWeight: '800',
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.income,
    marginRight: 8,
  },
  title: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.text,
  },
  contextRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  contextChip: {
    fontSize: 12,
    color: colors.accent,
    fontWeight: '700',
  },
  contextDivider: {
    color: colors.textSubtle,
    marginHorizontal: 6,
  },
  subtitle: {
    fontSize: 12,
    color: colors.textMuted,
  },
  logBtn: {
    minHeight: 36,
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceRaised,
    borderWidth: 1,
    borderColor: colors.borderStrong,
  },
  logBtnText: {
    fontSize: 12,
    color: colors.text,
    fontWeight: '700',
  },
  messageList: {
    flex: 1,
  },
  messageListContent: {
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  processingRow: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: spacing.lg,
    marginTop: spacing.xs,
    marginBottom: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  processingDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: colors.accent,
    marginRight: spacing.sm,
  },
  processingText: {
    fontSize: 12,
    color: colors.textMuted,
    fontWeight: '600',
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
