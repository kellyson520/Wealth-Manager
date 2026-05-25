import { ChatMessage } from '../../shared/types';
import { recallMemory, saveMemory } from '../../agents/_shared/memory';

export interface ConversationTurn {
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

const MAX_WINDOW_SIZE = 20;
const COMPRESS_THRESHOLD = 10;

export function getConversationWindow(
  messages: ChatMessage[],
  maxSize: number = MAX_WINDOW_SIZE
): ConversationTurn[] {
  const chatMessages = messages
    .filter((m) => m.role === 'user' || m.role === 'assistant')
    .slice(-maxSize);

  return chatMessages.map((m) => ({
    role: m.role === 'user' ? 'user' : 'assistant',
    content: m.content,
    timestamp: m.timestamp,
  }));
}

export function compressConversation(
  turns: ConversationTurn[]
): {
  summary: string;
  recentTurns: ConversationTurn[];
} {
  if (turns.length <= COMPRESS_THRESHOLD) {
    return { summary: '', recentTurns: turns };
  }

  const olderTurns = turns.slice(0, turns.length - COMPRESS_THRESHOLD);
  const recentTurns = turns.slice(-COMPRESS_THRESHOLD);

  const summary = buildSummary(olderTurns);
  return { summary, recentTurns };
}

function buildSummary(turns: ConversationTurn[]): string {
  const intents: string[] = [];
  let totalExpense = 0;
  let totalIncome = 0;
  const merchants: string[] = [];
  const categories: string[] = [];

  for (const turn of turns) {
    if (turn.role === 'user') {
      const text = turn.content;

      const amountMatch = text.match(/(\d+(?:\.\d+)?)\s*(?:块|元|块钱)/);
      if (amountMatch) {
        const amount = parseFloat(amountMatch[1]);
        if (text.includes('花') || text.includes('买') || text.includes('支出')) {
          totalExpense += amount;
        } else if (text.includes('收入') || text.includes('工资') || text.includes('到账')) {
          totalIncome += amount;
        }
      }

      const merchMatch = text.match(/(?:在|去|到)?(.+?)(?:花了|买了|消费|吃饭)/);
      if (merchMatch) {
        merchants.push(merchMatch[1].trim());
      }

      if (text.includes('查') || text.includes('看')) {
        intents.push('查询');
      } else if (text.includes('设置') || text.includes('预算')) {
        intents.push('设置');
      } else if (text.includes('分析') || text.includes('趋势')) {
        intents.push('分析');
      } else if (text.includes('花') || text.includes('买') || text.includes('记')) {
        intents.push('记账');
      }
    }
  }

  let summary = '早前对话摘要: ';
  const uniqueIntents = [...new Set(intents)];
  if (uniqueIntents.length > 0) {
    summary += `用户进行了${uniqueIntents.join('、')}操作`;
  }
  if (totalExpense > 0) {
    summary += `，总支出¥${totalExpense.toFixed(2)}`;
  }
  if (totalIncome > 0) {
    summary += `，总收入¥${totalIncome.toFixed(2)}`;
  }
  if (merchants.length > 0) {
    const uniqueMerchants = [...new Set(merchants)].slice(0, 5);
    summary += `，涉及商户: ${uniqueMerchants.join('、')}`;
  }
  summary += '。';

  return summary;
}

export async function buildContextMessages(
  messages: ChatMessage[]
): Promise<{ role: string; content: string }[]> {
  const window = getConversationWindow(messages);
  const { summary, recentTurns } = compressConversation(window);

  const contextMessages: { role: string; content: string }[] = [];

  if (summary) {
    contextMessages.push({
      role: 'system',
      content: `[历史对话摘要] ${summary}`,
    });
  }

  for (const turn of recentTurns) {
    contextMessages.push({
      role: turn.role,
      content: turn.content,
    });
  }

  return contextMessages;
}

export function estimateTokenCount(text: string): number {
  return Math.ceil(text.length / 3);
}
