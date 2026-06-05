import type { ToolEntry } from '../../agents/_shared/tool-registry';

export interface CacheOptimizedPromptInput {
  agentSystemPrompt: string;
  toolSystemPrompt: string;
  adaptiveContext?: string;
  personaPrompt?: string;
  recentContext?: string;
  nluContext?: string;
  userText: string;
}

export interface PromptCacheMetrics {
  stablePrefixHash: string;
  stablePrefixChars: number;
  dynamicChars: number;
  estimatedStableTokens: number;
  estimatedDynamicTokens: number;
  cacheableRatio: number;
}

export function sortToolsForPromptCache(tools: ToolEntry[]): ToolEntry[] {
  return [...tools].sort((a, b) => a.definition.name.localeCompare(b.definition.name));
}

export function buildCacheOptimizedMessages(
  input: CacheOptimizedPromptInput
): { messages: { role: string; content: string }[]; metrics: PromptCacheMetrics } {
  const stablePrefix = [
    '## CACHEABLE_STATIC_CONTEXT',
    input.agentSystemPrompt,
    input.toolSystemPrompt,
  ]
    .filter(Boolean)
    .join('\n\n');

  const dynamicContext = [
    input.adaptiveContext ? `## DYNAMIC_ADAPTIVE_CONTEXT\n${input.adaptiveContext}` : '',
    input.personaPrompt ? `## DYNAMIC_PERSONA_STATE\n${input.personaPrompt}` : '',
    input.recentContext ? `## RECENT_CONTEXT\n${input.recentContext}` : '',
    input.nluContext ? `## LOCAL_NLU\n${input.nluContext}` : '',
  ]
    .filter(Boolean)
    .join('\n\n');

  const messages: { role: string; content: string }[] = [
    { role: 'system', content: stablePrefix },
  ];

  if (dynamicContext) {
    messages.push({ role: 'system', content: dynamicContext });
  }

  messages.push({ role: 'user', content: input.userText });

  return {
    messages,
    metrics: buildPromptCacheMetrics(stablePrefix, dynamicContext),
  };
}

export function buildPromptCacheMetrics(
  stablePrefix: string,
  dynamicContext: string = ''
): PromptCacheMetrics {
  const stablePrefixChars = stablePrefix.length;
  const dynamicChars = dynamicContext.length;
  const estimatedStableTokens = estimatePromptTokens(stablePrefix);
  const estimatedDynamicTokens = estimatePromptTokens(dynamicContext);
  const total = estimatedStableTokens + estimatedDynamicTokens;

  return {
    stablePrefixHash: hashForCache(stablePrefix),
    stablePrefixChars,
    dynamicChars,
    estimatedStableTokens,
    estimatedDynamicTokens,
    cacheableRatio: total > 0 ? Math.round((estimatedStableTokens / total) * 10000) / 100 : 0,
  };
}

export function estimatePromptTokens(text: string): number {
  if (!text) return 0;
  return Math.max(1, Math.ceil(text.length / 3));
}

function hashForCache(text: string): string {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}
