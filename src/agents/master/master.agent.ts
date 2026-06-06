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
	  getTool,
	  listToolsForAgent,
	  executeTool,
	} from '../_shared';
import { callCloudLLM, callCloudLLMStream } from '../../core/cloud/api';
import { toolsToOpenAIFunctions, buildSystemPrompt } from '../../core/cloud/function-calling';
import { getAgentSystemPrompt } from '../../core/cloud/prompts/agent-prompts';
import {
  buildPromptCacheScope,
  buildProviderPromptCacheKey,
  buildCacheOptimizedMessages,
  getAdaptiveDynamicBudget,
  hashToolsetForPromptCache,
  recordPromptCacheUsage,
  sortToolsForPromptCache,
} from '../../core/cloud/prompt-cache';
import { recallRecentContext } from '../_shared/memory';
import { generatePersonaPrompt, updateMood, loadPersona } from '../../core/persona/persona-engine';
import { messageBus } from '../../core/message-bus';
import { buildAdaptiveContextPrompt, getPersonaSnapshot } from '../../core/memory/adaptive-context';
import {
  extractNluCorrection,
  maybeStoreUserPreferenceFromText,
  recordToolProcedureMemory,
} from '../../core/memory/memory-extractor';
import {
  inferIntentFromCorrectionTarget,
  inferIntentFromToolCall,
  learnIntentAlias,
  loadNluLearningSamples,
} from './nlu-learning';
import { applyUserConfirmationToToolArgs } from './tool-confirmation';

let toolsInitialized = false;
let messageBusInitialized = false;
let cloudApiKey: string | undefined;
let cloudApiConfig: {
  baseUrl?: string;
  model?: string;
  tokenParam?: 'max_tokens' | 'max_completion_tokens';
  thinking?: Record<string, unknown>;
  toolMode?: 'functions' | 'tools';
} = {};

export function setCloudApiKey(key: string | undefined): void {
  cloudApiKey = key;
}

export function getCloudApiKey(): string | undefined {
  return cloudApiKey;
}

export function setCloudApiConfig(config: typeof cloudApiConfig): void {
  cloudApiConfig = { ...config };
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
  await loadNluLearningSamples();
  const intent = classifyIntent(sanitized);
  const correctionLearned = await maybeLearnNluCorrection(sanitized);
  maybeStoreUserPreferenceFromText(sanitized).catch(() => {});

  let replyContent: string;
  let safetyWarning: string | undefined;

  if (correctionLearned) {
    replyContent = `已学习：以后会把「${correctionLearned.aliasText}」理解为 ${correctionLearned.intent}。`;
  } else if (intent.intent === 'unknown' || intent.confidence < 0.3) {
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
    case 'master':
      return handleMasterControl(intent);
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

async function handleMasterControl(intent: IntentResult): Promise<string> {
  const toolMap: Record<string, string> = {
    get_ai_cache_stats: 'get_ai_cache_stats',
    list_ai_memories: 'list_ai_memories',
    delete_ai_memory: 'delete_ai_memory',
    update_ai_persona: 'update_ai_persona',
    set_ai_learning_enabled: 'set_ai_learning_enabled',
    remember_user_preference: 'remember_user_preference',
  };
  const toolName = toolMap[intent.intent];
  if (!toolName) return generateFallbackReply();
  const entry = getTool(toolName);
  if (!entry) return 'AI 控制工具暂不可用。';

  const result = await executeTool(entry, intent.params, {
    agentId: 'master',
    userConfirmed: intent.params.confirmed === true,
  });

  if (!result.success) {
    return `${result.error || '操作失败'}。`;
  }

  if (intent.intent === 'list_ai_memories') {
    const memories = Array.isArray(result.data) ? result.data as { id: string; kind: string; content: string }[] : [];
    if (memories.length === 0) return '我目前没有保存可展示的 AI 记忆。';
    return `我记住了这些内容：\n${memories.slice(0, 10).map((m) => `- ${m.kind} ${m.id}: ${m.content}`).join('\n')}`;
  }

  if (intent.intent === 'get_ai_cache_stats') {
    const data = result.data as {
      overall?: { averageHitRate?: number; calls?: number; warmCalls?: number; averagePromptTokens?: number };
      stats?: { agentId: string; scope: string; averageHitRate: number; calls: number }[];
    } | undefined;
    const overall = data?.overall;
    const lines = (data?.stats || [])
      .slice(0, 5)
      .map((stat) => `- ${stat.scope}: ${stat.averageHitRate.toFixed(1)}%, ${stat.calls} 次`);
    return [
      `AI 缓存命中率 ${((overall?.averageHitRate || 0)).toFixed(1)}%，调用 ${overall?.calls || 0} 次，热缓存 ${overall?.warmCalls || 0} 次。`,
      lines.length > 0 ? lines.join('\n') : '',
    ].filter(Boolean).join('\n');
  }

  if (intent.intent === 'set_ai_learning_enabled') {
    const data = result.data as { enabled?: boolean } | undefined;
    return data?.enabled === false ? '已关闭自动学习。' : '已开启自动学习。';
  }

  if (intent.intent === 'update_ai_persona') {
    return '已更新 AI 人格设置。';
  }

  if (intent.intent === 'remember_user_preference') {
    return '已记住这个偏好。';
  }

  return '已完成。';
}

async function processWithLLM(
  userText: string,
  intent: IntentResult
): Promise<string> {
  const agentId: AgentId = 'master';
  const context = await recallRecentContext(agentId, 2);
  const masterTools = sortToolsForPromptCache(listToolsForAgent(agentId));
  const personaSnapshot = await getPersonaSnapshot();
  const cacheScope = buildPromptCacheScope(agentId, cloudApiConfig.model, {
    personaVersion: personaSnapshot.version,
    toolsetHash: hashToolsetForPromptCache(masterTools),
  });
  const adaptiveContext = await buildAdaptiveContextPrompt(agentId);

  const functions = toolsToOpenAIFunctions(masterTools);

  const { messages } = buildCacheOptimizedMessages({
    agentSystemPrompt: await getAgentSystemPrompt(agentId),
    toolSystemPrompt: buildSystemPrompt('Master', masterTools),
    adaptiveContext,
    personaPrompt: generatePersonaPrompt(),
    recentContext: context || undefined,
    nluContext: intent.intent !== 'unknown'
      ? `意图=${intent.intent}, Agent=${intent.agent}, 参数=${JSON.stringify(intent.params)}, 置信度=${intent.confidence.toFixed(2)}`
      : undefined,
    userText,
    dynamicBudget: getAdaptiveDynamicBudget(cacheScope),
  });

  const result = await callCloudLLM(
    {
      messages,
      baseUrl: cloudApiConfig.baseUrl,
      model: cloudApiConfig.model,
      tokenParam: cloudApiConfig.tokenParam,
      thinking: cloudApiConfig.thinking,
      toolMode: cloudApiConfig.toolMode,
      temperature: 0.5,
      functions: functions.length > 0 ? functions : undefined,
      functionCall: functions.length > 0 ? 'auto' : undefined,
      promptCacheKey: buildProviderPromptCacheKey(cacheScope),
      promptCacheRetention: '24h',
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
  recordPromptCacheUsage(cacheScope, response.usage, {
    agentId,
    source: 'non_stream',
    model: cloudApiConfig.model,
  });

  if (response.functionCall) {
    const args = applyUserConfirmationToToolArgs(parseToolArgs(response.functionCall.arguments), userText);
    const learned = inferIntentFromToolCall(response.functionCall.name, args);
    if (learned && (intent.intent === 'unknown' || intent.confidence < 0.6)) {
      learnIntentAlias({
        text: userText,
        intent: learned.intent,
        agent: learned.agent,
        params: learned.params,
        source: 'cloud_function',
        confidence: 0.84,
      }).catch(() => {});
    }
    const toolResult = await executeToolCall(
      response.functionCall.name,
      response.functionCall.arguments,
      userText
    );
    if (toolResult) {
      recordToolProcedureMemory({
        userText,
        toolName: response.functionCall.name,
        args,
      }).catch(() => {});
    }
    if (toolResult) return toolResult;
  }

  return response.content || generateFallbackReply();
}

async function executeToolCall(
  toolName: string,
  rawArgs: string,
  userText: string = ''
): Promise<string | null> {
  const entry = getTool(toolName);
  if (!entry) return null;

  let args: Record<string, unknown>;
  try {
    args = applyUserConfirmationToToolArgs(JSON.parse(rawArgs), userText);
  } catch {
    return null;
  }

  try {
    const result = await executeTool(entry, args, {
      agentId: 'master',
      userConfirmed: args.confirmed === true,
    });
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
    initMessageBus();
    toolsInitialized = true;
  }

  const sanitized = sanitizeText(userMessage);
  await loadNluLearningSamples();
  const intent = classifyIntent(sanitized);
  const correctionLearned = await maybeLearnNluCorrection(sanitized);
  maybeStoreUserPreferenceFromText(sanitized).catch(() => {});

  if (correctionLearned) {
    const messageId = `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const reply = `已学习：以后会把「${correctionLearned.aliasText}」理解为 ${correctionLearned.intent}。`;
    for (const char of reply) {
      yield { type: 'token', content: char, messageId };
    }
    yield { type: 'done', messageId };
    return;
  }

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

  const agentId: AgentId = 'master';
  const context = await recallRecentContext(agentId, 2);
  const masterTools = sortToolsForPromptCache(listToolsForAgent(agentId));
  const personaSnapshot = await getPersonaSnapshot();
  const cacheScope = buildPromptCacheScope(agentId, cloudApiConfig.model, {
    personaVersion: personaSnapshot.version,
    toolsetHash: hashToolsetForPromptCache(masterTools),
  });
  const functions = toolsToOpenAIFunctions(masterTools);
  const adaptiveContext = await buildAdaptiveContextPrompt(agentId);

  const { messages } = buildCacheOptimizedMessages({
    agentSystemPrompt: await getAgentSystemPrompt(agentId),
    toolSystemPrompt: buildSystemPrompt('Master', masterTools),
    adaptiveContext,
    personaPrompt: generatePersonaPrompt(),
    recentContext: context || undefined,
    nluContext: intent.intent !== 'unknown'
      ? `意图=${intent.intent}, Agent=${intent.agent}, 置信度=${intent.confidence.toFixed(2)}`
      : undefined,
    userText: sanitized,
    dynamicBudget: getAdaptiveDynamicBudget(cacheScope),
  });

  let textBuffer = '';

  const stream = callCloudLLMStream(
    {
      messages,
      baseUrl: cloudApiConfig.baseUrl,
      model: cloudApiConfig.model,
      tokenParam: cloudApiConfig.tokenParam,
      thinking: cloudApiConfig.thinking,
      toolMode: cloudApiConfig.toolMode,
      temperature: 0.5,
      functions: functions.length > 0 ? functions : undefined,
      functionCall: functions.length > 0 ? 'auto' : undefined,
      promptCacheKey: buildProviderPromptCacheKey(cacheScope),
      promptCacheRetention: '24h',
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
          const safeToolArgs = applyUserConfirmationToToolArgs(
            parseToolArgs(chunk.functionCall.arguments),
            sanitized
          );
          yield {
            type: 'tool_call',
            toolName: chunk.functionCall.name,
            toolArgs: safeToolArgs,
            messageId,
          };

          const toolResult = await executeToolCall(
            chunk.functionCall.name,
            chunk.functionCall.arguments,
            sanitized
          );
          if (toolResult) {
            recordToolProcedureMemory({
              userText: sanitized,
              toolName: chunk.functionCall.name,
              args: safeToolArgs,
            }).catch(() => {});
          }

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
        if (chunk.usage?.promptTokens) {
          recordPromptCacheUsage(cacheScope, chunk.usage, {
            agentId,
            source: 'stream',
            model: cloudApiConfig.model,
          });
        }
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

async function maybeLearnNluCorrection(text: string): Promise<{
  aliasText: string;
  intent: string;
  agent: string;
} | null> {
  const correction = extractNluCorrection(text);
  if (!correction) return null;

  const classifiedTarget = classifyIntent(correction.targetText);
  const target = classifiedTarget.intent !== 'unknown' && classifiedTarget.confidence >= 0.3
    ? {
      intent: classifiedTarget.intent,
      agent: classifiedTarget.agent,
      params: classifiedTarget.params,
    }
    : inferIntentFromCorrectionTarget(correction.targetText);

  if (!target) return null;

  await learnIntentAlias({
    text: correction.aliasText,
    intent: target.intent,
    agent: target.agent,
    params: target.params,
    source: 'user_feedback',
    confidence: correction.confidence,
  });

  return {
    aliasText: correction.aliasText,
    intent: target.intent,
    agent: target.agent,
  };
}
