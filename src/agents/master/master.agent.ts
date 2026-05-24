import { ChatMessage, IntentResult } from '../../shared/types';
import { classifyIntent } from './nlu';

export interface ProcessedMessage {
  reply: ChatMessage;
}

export async function processMessage(
  userMessage: string,
  handleIntent: (intent: IntentResult) => Promise<string>
): Promise<ProcessedMessage> {
  const intent = classifyIntent(userMessage);

  let replyContent: string;

  if (intent.intent === 'unknown' || intent.confidence < 0.3) {
    replyContent = generateFallbackReply();
  } else {
    replyContent = await handleIntent(intent);
  }

  return {
    reply: {
      id: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      role: 'assistant',
      content: replyContent,
      timestamp: new Date().toISOString(),
    },
  };
}

function generateFallbackReply(): string {
  const replies = [
    '您好！我是您的财务助手 💰\n\n您可以这样使用：\n• "午饭花了35块" — 记账\n• "今天花了多少？" — 查看汇总\n• "查一下餐饮消费" — 搜索账单\n• "工资到账5000" — 记录收入',
    '我目前可以帮您：\n📝 记账（说话就记）\n📊 查看账单汇总\n🔍 搜索历史账单\n\n请告诉我您想做什么？',
  ];
  return replies[Math.floor(Math.random() * replies.length)];
}
