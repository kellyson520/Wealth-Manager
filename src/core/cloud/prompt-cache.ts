import type { ToolEntry } from '../../agents/_shared/tool-registry';

export interface CacheOptimizedPromptInput {
  agentSystemPrompt: string;
  toolSystemPrompt: string;
  adaptiveContext?: string;
  personaPrompt?: string;
  recentContext?: string;
  nluContext?: string;
  userText: string;
  dynamicBudget?: Partial<DynamicPromptBudget>;
}

export interface PromptCacheMetrics {
  stablePrefixHash: string;
  stablePrefixChars: number;
  dynamicChars: number;
  estimatedStableTokens: number;
  estimatedDynamicTokens: number;
  cacheableRatio: number;
}

export interface DynamicPromptBudget {
  adaptiveContextChars: number;
  personaPromptChars: number;
  recentContextChars: number;
  nluContextChars: number;
}

const DEFAULT_DYNAMIC_BUDGET: DynamicPromptBudget = {
  adaptiveContextChars: 420,
  personaPromptChars: 160,
  recentContextChars: 220,
  nluContextChars: 140,
};

const CACHEABLE_ADAPTIVE_SECTIONS = new Set(['SOUL', 'TONE_RULES', 'BOUNDARIES']);

export function sortToolsForPromptCache(tools: ToolEntry[]): ToolEntry[] {
  return [...tools].sort((a, b) => a.definition.name.localeCompare(b.definition.name));
}

export function buildCacheOptimizedMessages(
  input: CacheOptimizedPromptInput
): { messages: { role: string; content: string }[]; metrics: PromptCacheMetrics } {
  const budget = { ...DEFAULT_DYNAMIC_BUDGET, ...(input.dynamicBudget || {}) };
  const adaptive = splitAdaptiveContextForCache(input.adaptiveContext || '');
  const stablePrefix = [
    '## CACHEABLE_STATIC_CONTEXT',
    input.agentSystemPrompt,
    adaptive.cacheable,
    input.toolSystemPrompt,
  ]
    .filter(Boolean)
    .join('\n\n');

  const dynamicContext = [
    adaptive.dynamic ? formatDynamicSection('ADAPTIVE', adaptive.dynamic, budget.adaptiveContextChars) : '',
    input.personaPrompt ? formatDynamicSection('PERSONA', input.personaPrompt, budget.personaPromptChars) : '',
    input.recentContext ? formatDynamicSection('RECENT', input.recentContext, budget.recentContextChars) : '',
    input.nluContext ? formatDynamicSection('NLU', input.nluContext, budget.nluContextChars) : '',
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

export function splitAdaptiveContextForCache(context: string): { cacheable: string; dynamic: string } {
  const normalized = context.replace(/\r\n/g, '\n').trim();
  if (!normalized) return { cacheable: '', dynamic: '' };

  const sections = parseMarkdownSections(normalized);
  if (sections.length === 0) {
    return { cacheable: '', dynamic: normalized };
  }

  const cacheable: string[] = [];
  const dynamic: string[] = [];

  for (const section of sections) {
    const block = `## ${section.title}\n${section.content}`;
    if (CACHEABLE_ADAPTIVE_SECTIONS.has(section.title)) {
      cacheable.push(block);
    } else {
      dynamic.push(block);
    }
  }

  return {
    cacheable: cacheable.join('\n\n'),
    dynamic: dynamic.join('\n\n'),
  };
}

function parseMarkdownSections(text: string): { title: string; content: string }[] {
  const sections: { title: string; content: string }[] = [];
  const pattern = /^##\s+([A-Z_]+)\s*\n([\s\S]*?)(?=^##\s+[A-Z_]+\s*\n|\s*$)/gm;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text)) !== null) {
    const title = match[1].trim();
    const content = compactWhitespace(match[2]);
    if (title && content) sections.push({ title, content });
  }

  return sections;
}

function formatDynamicSection(label: string, value: string, maxChars: number): string {
  const compact = compactWhitespace(value);
  if (!compact) return '';
  return `## DYNAMIC_${label}\n${trimToBudget(compact, maxChars)}`;
}

function compactWhitespace(value: string): string {
  return value
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join('\n');
}

function trimToBudget(value: string, maxChars: number): string {
  if (value.length <= maxChars) return value;

  const lines = value.split('\n');
  const kept: string[] = [];
  let used = 0;
  for (const line of lines) {
    const next = used + line.length + (kept.length > 0 ? 1 : 0);
    if (next > maxChars) break;
    kept.push(line);
    used = next;
  }

  if (kept.length > 0) return `${kept.join('\n')}\n...`;
  return `${value.slice(0, Math.max(0, maxChars - 3)).trim()}...`;
}

function hashForCache(text: string): string {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}
