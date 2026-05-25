import { ChatMessage, IntentResult, AgentId } from '../../shared/types';
import { classifyIntent } from './nlu';
import { handleIntent as handleLedger } from '../ledger/ledger.agent';
import { handleIntent as handleAnalyst } from '../analyst/analyst.agent';
import { handleIntent as handleCoach } from '../coach/coach.agent';
import { handleIntent as handleGuardian, sanitizeText } from '../guardian/guardian.agent';
import {
  getDelegationTargets,
  rememberMoment,
  initToolRegistry,
  getAllTools,
  getTool,
  listToolsForAgent,
} from '../_shared';
import { callCloudLLM, callCloudLLMStream } from '../../core/cloud/api';
import { toolsToOpenAIFunctions, buildSystemPrompt } from '../../core/cloud/function-calling';
import { getAgentSystemPrompt } from '../../core/cloud/prompts/agent-prompts';
import { recallRecentContext } from '../_shared/memory';
import { generatePersonaPrompt, updateMood, loadPersona } from '../../core/persona/persona-engine';
import { messageBus } from '../../core/message-bus';

let toolsInitialized = false;
let messageBusInitialized = false;
let cloudApiKey: string | undefined;

export function setCloudApiKey(key: string | undefined): void {
  cloudApiKey = key;
}

export function getCloudApiKey(): string | undefined {
  return cloudApiKey;
}

export function initMessageBus(): void {
  if (messageBusInitialized) return;
  messageBusInitialized = true;

  messageBus.subscribe('ledger' as AgentId, async (msg) => {
    if (msg.type === 'request') {
      try {
        const result = await handleLedger({
          intent: 'unknown',
          params: msg.payload,
          confidence: 1.0,
          agent: 'ledger',
        });
        await messageBus.publish({
          from: 'ledger' as AgentId,
          to: msg.from,
          type: 'response',
          payload: { result, success: true },
          correlationId: msg.id,
        });
      } catch (e) {
        await messageBus.publish({
          from: 'ledger' as AgentId,
          to: msg.from,
          type: 'error',
          payload: { error: e instanceof Error ? e.message : 'Unknown' },
          correlationId: msg.id,
        });
      }
    }
  });

  messageBus.subscribe('analyst' as AgentId, async (msg) => {
    if (msg.type === 'request') {
      try {
        const result = await handleAnalyst({
          intent: 'unknown',
          params: msg.payload,
          confidence: 1.0,
          agent: 'analyst',
        });
        await messageBus.publish({
          from: 'analyst' as AgentId,
          to: msg.from,
          type: 'response',
          payload: { result, success: true },
          correlationId: msg.id,
        });
      } catch (e) {
        await messageBus.publish({
          from: 'analyst' as AgentId,
          to: msg.from,
          type: 'error',
          payload: { error: e instanceof Error ? e.message : 'Unknown' },
          correlationId: msg.id,
        });
      }
    }
  });

  messageBus.subscribe('coach' as AgentId, async (msg) => {
    if (msg.type === 'request') {
      try {
        const result = await handleCoach({
          intent: 'unknown',
          params: msg.payload,
          confidence: 1.0,
          agent: 'coach',
        });
        await messageBus.publish({
          from: 'coach' as AgentId,
          to: msg.from,
          type: 'response',
          payload: { result, success: true },
          correlationId: msg.id,
        });
      } catch (e) {
        await messageBus.publish({
          from: 'coach' as AgentId,
          to: msg.from,
          type: 'error',
          payload: { error: e instanceof Error ? e.message : 'Unknown' },
          correlationId: msg.id,
        });
      }
    }
  });

  messageBus.subscribe('guardian' as AgentId, async (msg) => {
    if (msg.type === 'request') {
      try {
        const result = await handleGuardian({
          intent: 'unknown',
          params: msg.payload,
          confidence: 1.0,
          agent: 'guardian',
        });
        await messageBus.publish({
          from: 'guardian' as AgentId,
          to: msg.from,
          type: 'response',
          payload: { result, success: true },
          correlationId: msg.id,
        });
      } catch (e) {
        await messageBus.publish({
          from: 'guardian' as AgentId,
          to: msg.from,
          type: 'error',
          payload: { error: e instanceof Error ? e.message : 'Unknown' },
          correlationId: msg.id,
        });
      }
    }
  });
}

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
    initMessageBus();
    toolsInitialized = true;
  }

  const agentId: AgentId = 'master';

  loadPersona().catch(() => {});
  updateMood().catch(() => {});

  const sanitized = sanitizeText(userMessage);
  const intent = classifyIntent(sanitized);

  let replyContent: string;
  let safetyWarning: string | undefined;

  if (intent.intent === 'unknown' || intent.confidence < 0.3) {
    if (cloudApiKey) {
      replyContent = await processWithLLM(sanitized, intent);
    } else {
      replyContent = generateFallbackReply();
    }
  } else if (intent.confidence < 0.6 && cloudApiKey) {
    const llmReply = await processWithLLM(sanitized, intent);
    replyContent = llmReply || await routeIntent(intent);
  } else {
    replyContent = await routeIntent(intent);
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

async function routeIntent(intent: IntentResult): Promise<string> {
  switch (intent.agent) {
    case 'ledger':
      return handleLedger(intent);
    case 'analyst':
      return handleAnalyst(intent);
    case 'coach':
      return handleCoach(intent);
    case 'guardian':
      return handleGuardian(intent);
    default:
      return handleLedger(intent);
  }
}

async function processWithLLM(
  userText: string,
  intent: IntentResult
): Promise<string> {
  const context = await recallRecentContext('master', 5);
  const masterTools = listToolsForAgent('master');

  const functions = toolsToOpenAIFunctions([...getAllTools().values()]);

  const messages: { role: string; content: string }[] = [
    {
      role: 'system',
      content: `${await getAgentSystemPrompt('master')}\n\n${generatePersonaPrompt()}\n${buildSystemPrompt('Master', [...getAllTools().values()])}`,
    },
  ];

  if (context) {
    messages.push({ role: 'system', content: `最近的对话上下文:\n${context}` });
  }

  if (intent.intent !== 'unknown') {
    messages.push({
      role: 'system',
      content: `本地NLU分析结果: 意图=${intent.intent}, Agent=${intent.agent}, 参数=${JSON.stringify(intent.params)}, 置信度=${intent.confidence.toFixed(2)}`,
    });
  }

  messages.push({ role: 'user', content: userText });

  const result = await callCloudLLM(
    {
      messages,
      temperature: 0.5,
      functions: functions.length > 0 ? functions : undefined,
      functionCall: functions.length > 0 ? 'auto' : undefined,
    },
    cloudApiKey
  );

  if (!result.success || !result.response) {
    if (intent.intent !== 'unknown') {
      return routeIntent(intent);
    }
    return generateFallbackReply();
  }

  const { response } = result;

  if (response.functionCall) {
    const toolResult = await executeToolCall(
      response.functionCall.name,
      response.functionCall.arguments
    );
    if (toolResult) return toolResult;
  }

  return response.content || generateFallbackReply();
}

async function executeToolCall(
  toolName: string,
  rawArgs: string
): Promise<string | null> {
  const entry = getTool(toolName);
  if (!entry) return null;

  let args: Record<string, unknown>;
  try {
    args = JSON.parse(rawArgs);
  } catch {
    return null;
  }

  try {
    const result = await entry.handler(args);
    if (result && result.success) {
      if (result.data) {
        return typeof result.data === 'string'
          ? result.data
          : JSON.stringify(result.data, null, 2);
      }
      return `工具 ${toolName} 执行成功`;
    }
    return `工具 ${toolName} 执行失败: ${result?.error || '未知错误'}`;
  } catch (e) {
    return `工具 ${toolName} 执行异常: ${e instanceof Error ? e.message : 'Unknown'}`;
  }
}

function generateFallbackReply(): string {
  const replies = [
    '您好！我是您的财务助手 💰\n\n您可以这样使用：\n• "午饭花了35块" — 记账\n• "今天花了多少？" — 查看汇总\n• "设置餐饮预算 3000" — 设定预算\n• "消费趋势分析" — 深度分析\n• "安全扫描" — 异常检测\n• "查看成就" — 我的成就',
    '我目前可以帮您：\n📝 记账（说话就记）\n📊 查看账单汇总与趋势分析\n🎯 设置预算和储蓄目标\n🛡️ 安全扫描与隐私保护\n🏆 成就系统和打卡激励\n\n请告诉我您想做什么？',
  ];
  return replies[Math.floor(Math.random() * replies.length)];
}

export async function* processMessageStream(
  userMessage: string
): AsyncGenerator<{
  type: 'token' | 'thinking' | 'tool_call' | 'tool_result' | 'done' | 'error';
  content?: string;
  toolName?: string;
  toolArgs?: Record<string, unknown>;
  messageId?: string;
  error?: string;
}, void, unknown> {
  if (!toolsInitialized) {
    initToolRegistry();
    toolsInitialized = true;
  }

  const agentId: AgentId = 'master';
  const sanitized = sanitizeText(userMessage);
  const intent = classifyIntent(sanitized);

  if (!cloudApiKey) {
    const reply = intent.intent === 'unknown' || intent.confidence < 0.3
      ? generateFallbackReply()
      : await routeIntent(intent);

    const messageId = `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    for (const char of reply) {
      yield { type: 'token', content: char, messageId };
    }
    yield { type: 'done', messageId };
    return;
  }

  const messageId = `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  (yield { type: 'thinking' as const, content: '分析中...', messageId }) as void;

  const context = await recallRecentContext('master', 5);
  const allTools = [...getAllTools().values()];
  const functions = toolsToOpenAIFunctions(allTools);

  const messages: { role: string; content: string }[] = [
    {
      role: 'system',
      content: `${await getAgentSystemPrompt('master')}\n\n${buildSystemPrompt('Master', allTools)}`,
    },
  ];

  if (context) {
    messages.push({ role: 'system', content: `最近上下文:\n${context}` });
  }

  if (intent.intent !== 'unknown') {
    messages.push({
      role: 'system',
      content: `本地NLU分析: 意图=${intent.intent}, Agent=${intent.agent}, 置信度=${intent.confidence.toFixed(2)}`,
    });
  }

  messages.push({ role: 'user', content: sanitized });

  let textBuffer = '';

  const stream = callCloudLLMStream(
    {
      messages,
      temperature: 0.5,
      functions: functions.length > 0 ? functions : undefined,
      functionCall: functions.length > 0 ? 'auto' : undefined,
    },
    cloudApiKey
  );

  for await (const chunk of stream) {
    switch (chunk.type) {
      case 'token':
        if (chunk.content) {
          textBuffer += chunk.content;
          yield { type: 'token', content: chunk.content, messageId };
        }
        break;
      case 'function_call':
        if (chunk.functionCall) {
          yield {
            type: 'tool_call',
            toolName: chunk.functionCall.name,
            toolArgs: parseToolArgs(chunk.functionCall.arguments),
            messageId,
          };

          const toolResult = await executeToolCall(
            chunk.functionCall.name,
            chunk.functionCall.arguments
          );

          yield { type: 'tool_result', content: toolResult || '工具执行完成', messageId };
        }
        break;
      case 'error':
        if (!textBuffer) {
          const fallback = intent.intent === 'unknown'
            ? generateFallbackReply()
            : await routeIntent(intent);
          for (const char of fallback) {
            yield { type: 'token', content: char, messageId };
          }
        }
        break;
      case 'done':
        break;
    }
  }

  yield { type: 'done', messageId };
}

function parseToolArgs(rawArgs: string): Record<string, unknown> {
  try {
    return JSON.parse(rawArgs);
  } catch {
    return {};
  }
}
