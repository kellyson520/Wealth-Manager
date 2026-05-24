import { ChatMessage, IntentResult, AgentId } from '../../shared/types';
import { classifyIntent } from './nlu';
import { handleIntent as handleLedger } from '../ledger/ledger.agent';
import { handleIntent as handleAnalyst } from '../analyst/analyst.agent';
import { handleIntent as handleCoach } from '../coach/coach.agent';
import { handleIntent as handleGuardian, preActionCheck, sanitizeText } from '../guardian/guardian.agent';
import {
  getSecurityProfile,
  getDelegationTargets,
  rememberMoment,
  recallRecentContext,
  initToolRegistry,
} from '../_shared';

let toolsInitialized = false;

export interface ProcessedMessage {
  reply: ChatMessage;
  safetyWarning?: string;
}

export async function processMessage(
  userMessage: string,
  handleIntent?: (intent: IntentResult) => Promise<string>
): Promise<ProcessedMessage> {
  if (!toolsInitialized) {
    initToolRegistry();
    toolsInitialized = true;
  }

  const agentId: AgentId = 'master';
  const profile = getSecurityProfile(agentId);

  const sanitized = sanitizeText(userMessage);
  const intent = classifyIntent(sanitized);

  const recalledContext = await recallRecentContext(agentId, 3);

  let replyContent: string;
  let safetyWarning: string | undefined;

  if (intent.intent === 'unknown' || intent.confidence < 0.3) {
    replyContent = generateFallbackReply();
  } else {
    switch (intent.agent) {
      case 'ledger':
        replyContent = await handleLedger(intent);
        break;
      case 'analyst':
        replyContent = await handleAnalyst(intent);
        break;
      case 'coach':
        replyContent = await handleCoach(intent);
        break;
      case 'guardian':
        replyContent = await handleGuardian(intent);
        break;
      default:
        replyContent = await handleLedger(intent);
    }
  }

  const delegationTargets = getDelegationTargets(agentId);
  await rememberMoment(
    agentId,
    `意图:${intent.intent}|置信度:${intent.confidence.toFixed(2)}|路由:${intent.agent}|可委派:${delegationTargets.join(',')}`
  );

  return {
    reply: {
      id: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      role: 'assistant',
      content: replyContent,
      timestamp: new Date().toISOString(),
    },
    safetyWarning,
  };
}

function generateFallbackReply(): string {
  const replies = [
    '您好！我是您的财务助手 💰\n\n您可以这样使用：\n• "午饭花了35块" — 记账\n• "今天花了多少？" — 查看汇总\n• "设置餐饮预算 3000" — 设定预算\n• "消费趋势分析" — 深度分析\n• "安全扫描" — 异常检测\n• "查看成就" — 我的成就',
    '我目前可以帮您：\n📝 记账（说话就记）\n📊 查看账单汇总与趋势分析\n🎯 设置预算和储蓄目标\n🛡️ 安全扫描与隐私保护\n🏆 成就系统和打卡激励\n\n请告诉我您想做什么？',
  ];
  return replies[Math.floor(Math.random() * replies.length)];
}
