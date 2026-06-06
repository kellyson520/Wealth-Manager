import type { ToolEntry } from '../../agents/_shared/tool-registry';
import { getDatabase } from '../database/database';
import type { AgentId } from '../../shared/types';

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

export interface PromptCacheUsageInput {
  promptTokens?: number;
  cachedPromptTokens?: number;
  completionTokens?: number;
}

export interface PromptCacheUsageMeta {
  agentId?: AgentId | string;
  source?: 'non_stream' | 'stream' | 'manual';
  model?: string;
}

export interface PromptCacheRuntimeStats {
  scope: string;
  agentId: string;
  calls: number;
  warmCalls: number;
  lastHitRate: number;
  averageHitRate: number;
  averagePromptTokens: number;
  averageCachedTokens: number;
  averageCompletionTokens: number;
  targetHitRate: number;
  budgetPressure: 'cold' | 'healthy' | 'watch' | 'tighten';
  recommendedBudget: DynamicPromptBudget;
  advice: PromptCacheOptimizationAdvice;
}

export interface PromptCacheTelemetryRow {
  id: string;
  scope: string;
  agentId: string;
  promptTokens: number;
  completionTokens: number;
  cachedPromptTokens: number;
  hitRate: number;
  source: string;
  model?: string;
  missReason?: string;
  createdAt: string;
}

export interface PromptCacheOptimizationAdvice {
  status: 'cold_start' | 'healthy' | 'prefix_unstable' | 'dynamic_pressure' | 'partial_reuse';
  title: string;
  detail: string;
  actions: string[];
}

export interface PromptCacheDashboard {
  overall: PromptCacheRuntimeStats;
  stats: PromptCacheRuntimeStats[];
  recent: PromptCacheTelemetryRow[];
  cost: PromptCacheCostSummary;
}

export interface PromptCacheCostSummary {
  promptTokens: number;
  cachedPromptTokens: number;
  completionTokens: number;
  savedPromptTokens: number;
  cacheSavingsRate: number;
  estimatedUncachedCostUnits: number;
  estimatedCostUnits: number;
  savedCostUnits: number;
  pressure: 'low' | 'medium' | 'high';
}

const DEFAULT_DYNAMIC_BUDGET: DynamicPromptBudget = {
  adaptiveContextChars: 420,
  personaPromptChars: 160,
  recentContextChars: 220,
  nluContextChars: 140,
};

const CACHEABLE_ADAPTIVE_SECTIONS = new Set(['SOUL', 'TONE_RULES', 'BOUNDARIES']);
const TARGET_CACHE_HIT_RATE = 90;
const TELEMETRY_WINDOW = 8;
const MIN_DYNAMIC_BUDGET: DynamicPromptBudget = {
  adaptiveContextChars: 180,
  personaPromptChars: 80,
  recentContextChars: 90,
  nluContextChars: 80,
};

type TelemetrySample = {
  id: string;
  scope: string;
  agentId: string;
  promptTokens: number;
  completionTokens: number;
  cachedPromptTokens: number;
  hitRate: number;
  source: string;
  model?: string;
  missReason?: string;
  createdAt: string;
};

const telemetry = new Map<string, TelemetrySample[]>();

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

export function recordPromptCacheUsage(
  scope: string,
  usage: PromptCacheUsageInput,
  meta: PromptCacheUsageMeta = {}
): PromptCacheRuntimeStats {
  const promptTokens = usage.promptTokens || 0;
  const cachedPromptTokens = usage.cachedPromptTokens || 0;
  const completionTokens = usage.completionTokens || 0;
  const hitRate = promptTokens > 0
    ? Math.round((cachedPromptTokens / promptTokens) * 10000) / 100
    : 0;
  const missReason = inferCacheMissReason(promptTokens, cachedPromptTokens, hitRate);
  const sample: TelemetrySample = {
    id: `pc_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    scope,
    agentId: meta.agentId || scope.split(':')[0] || 'master',
    promptTokens,
    completionTokens,
    cachedPromptTokens,
    hitRate,
    source: meta.source || 'non_stream',
    model: meta.model,
    missReason,
    createdAt: new Date().toISOString(),
  };

  const rows = telemetry.get(scope) || [];
  rows.push(sample);
  while (rows.length > TELEMETRY_WINDOW) rows.shift();
  telemetry.set(scope, rows);

  persistPromptCacheTelemetry(sample).catch(() => {});

  return getPromptCacheRuntimeStats(scope);
}

export function getPromptCacheRuntimeStats(scope: string): PromptCacheRuntimeStats {
  const rows = telemetry.get(scope) || [];
  const warmRows = rows.filter((row) => row.cachedPromptTokens > 0);
  const averageHitRate = calculateTokenHitRate(rows);
  const advice = buildOptimizationAdvice(rows, averageHitRate);

  return {
    scope,
    agentId: rows[rows.length - 1]?.agentId || scope.split(':')[0] || 'master',
    calls: rows.length,
    warmCalls: warmRows.length,
    lastHitRate: rows[rows.length - 1]?.hitRate || 0,
    averageHitRate,
    averagePromptTokens: Math.round(average(rows.map((row) => row.promptTokens))),
    averageCachedTokens: Math.round(average(rows.map((row) => row.cachedPromptTokens))),
    averageCompletionTokens: Math.round(average(rows.map((row) => row.completionTokens))),
    targetHitRate: TARGET_CACHE_HIT_RATE,
    budgetPressure: getBudgetPressure(rows, averageHitRate),
    recommendedBudget: getAdaptiveDynamicBudget(scope),
    advice,
  };
}

export async function getPromptCacheDashboard(options?: {
  scope?: string;
  agentId?: AgentId | string;
  limit?: number;
}): Promise<PromptCacheDashboard> {
  await hydratePromptCacheTelemetry(options);
  const recent = await loadPromptCacheRecentRows(options);
  const scopes = new Set<string>([
    ...Array.from(telemetry.keys()),
    ...recent.map((row) => row.scope),
  ]);
  const stats = Array.from(scopes)
    .filter((scope) => !options?.scope || scope === options.scope)
    .map((scope) => getPromptCacheRuntimeStats(scope))
    .filter((stat) => !options?.agentId || stat.agentId === options.agentId)
    .sort((a, b) => b.averageHitRate - a.averageHitRate);

  return {
    overall: buildOverallStats(stats),
    stats,
    recent,
    cost: buildCostSummary(recent),
  };
}

export function buildPromptCacheScope(
  agentId: AgentId | string,
  model?: string,
  parts?: { personaVersion?: number; toolsetHash?: string }
): string {
  const normalizedModel = (model || '').trim();
  const scopeParts = [String(agentId)];
  if (normalizedModel) scopeParts.push(normalizedModel);
  if (parts?.personaVersion) scopeParts.push(`p${parts.personaVersion}`);
  if (parts?.toolsetHash) scopeParts.push(`t${parts.toolsetHash}`);
  return scopeParts.join(':');
}

export function buildProviderPromptCacheKey(scope: string): string {
  const safeScope = scope
    .replace(/[^a-zA-Z0-9_.:-]/g, '_')
    .slice(0, 160);
  return `wealth-manager:${safeScope}`;
}

export function hashToolsetForPromptCache(tools: ToolEntry[]): string {
  return hashForCache(tools.map((tool) => tool.definition.name).sort().join('|')).slice(0, 8);
}

export function getAdaptiveDynamicBudget(scope: string): DynamicPromptBudget {
  const rows = telemetry.get(scope) || [];
  if (rows.length < 2) return { ...DEFAULT_DYNAMIC_BUDGET };

  const averageHitRate = calculateTokenHitRate(rows);
  if (averageHitRate >= TARGET_CACHE_HIT_RATE) return { ...DEFAULT_DYNAMIC_BUDGET };

  const pressure = averageHitRate < 80 ? 0.45 : 0.65;
  return scaleBudget(DEFAULT_DYNAMIC_BUDGET, pressure);
}

export function resetPromptCacheTelemetryForTest(): void {
  telemetry.clear();
}

export async function hydratePromptCacheTelemetry(options?: {
  scope?: string;
  agentId?: AgentId | string;
  limit?: number;
}): Promise<void> {
  const rows = await loadPromptCacheRecentRows({
    ...options,
    limit: Math.max(options?.limit || TELEMETRY_WINDOW * 5, TELEMETRY_WINDOW),
  });
  const grouped = new Map<string, TelemetrySample[]>();
  for (const row of rows.reverse()) {
    const samples = grouped.get(row.scope) || [];
    samples.push({ ...row });
    while (samples.length > TELEMETRY_WINDOW) samples.shift();
    grouped.set(row.scope, samples);
  }

  for (const [scope, rowsForScope] of grouped) {
    telemetry.set(scope, rowsForScope);
  }
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

function scaleBudget(budget: DynamicPromptBudget, factor: number): DynamicPromptBudget {
  return {
    adaptiveContextChars: Math.max(MIN_DYNAMIC_BUDGET.adaptiveContextChars, Math.round(budget.adaptiveContextChars * factor)),
    personaPromptChars: Math.max(MIN_DYNAMIC_BUDGET.personaPromptChars, Math.round(budget.personaPromptChars * factor)),
    recentContextChars: Math.max(MIN_DYNAMIC_BUDGET.recentContextChars, Math.round(budget.recentContextChars * factor)),
    nluContextChars: Math.max(MIN_DYNAMIC_BUDGET.nluContextChars, Math.round(budget.nluContextChars * factor)),
  };
}

function average(values: number[]): number {
  if (values.length === 0) return 0;
  return Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 100) / 100;
}

function calculateTokenHitRate(rows: Pick<TelemetrySample, 'promptTokens' | 'cachedPromptTokens'>[]): number {
  const promptTokens = rows.reduce((sum, row) => sum + row.promptTokens, 0);
  if (promptTokens <= 0) return 0;
  const cachedPromptTokens = rows.reduce((sum, row) => sum + row.cachedPromptTokens, 0);
  return Math.round((cachedPromptTokens / promptTokens) * 10000) / 100;
}

async function persistPromptCacheTelemetry(sample: TelemetrySample): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    `INSERT INTO prompt_cache_telemetry (
      id, scope, agent_id, prompt_tokens, completion_tokens,
      cached_prompt_tokens, hit_rate, source, model, miss_reason, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      sample.id,
      sample.scope,
      sample.agentId,
      sample.promptTokens,
      sample.completionTokens,
      sample.cachedPromptTokens,
      sample.hitRate,
      sample.source,
      sample.model || null,
      sample.missReason || null,
      sample.createdAt,
    ]
  );
}

async function loadPromptCacheRecentRows(options?: {
  scope?: string;
  agentId?: AgentId | string;
  limit?: number;
}): Promise<PromptCacheTelemetryRow[]> {
  try {
    const db = await getDatabase();
    const where: string[] = [];
    const args: (string | number)[] = [];
    if (options?.scope) {
      where.push('scope = ?');
      args.push(options.scope);
    }
    if (options?.agentId) {
      where.push('agent_id = ?');
      args.push(String(options.agentId));
    }
    args.push(options?.limit || 40);
    const rows = await db.getAllAsync<{
      id: string;
      scope: string;
      agent_id: string;
      prompt_tokens: number;
      completion_tokens: number;
      cached_prompt_tokens: number;
      hit_rate: number;
      source: string;
      model?: string | null;
      miss_reason?: string | null;
      created_at: string;
    }>(
      `SELECT id, scope, agent_id, prompt_tokens, completion_tokens,
        cached_prompt_tokens, hit_rate, source, model, miss_reason, created_at
       FROM prompt_cache_telemetry
       ${where.length > 0 ? `WHERE ${where.join(' AND ')}` : ''}
       ORDER BY created_at DESC
       LIMIT ?`,
      args
    );
    return rows.map((row) => ({
      id: row.id,
      scope: row.scope,
      agentId: row.agent_id,
      promptTokens: row.prompt_tokens || 0,
      completionTokens: row.completion_tokens || 0,
      cachedPromptTokens: row.cached_prompt_tokens || 0,
      hitRate: row.hit_rate || 0,
      source: row.source || 'non_stream',
      model: row.model || undefined,
      missReason: row.miss_reason || inferCacheMissReason(row.prompt_tokens || 0, row.cached_prompt_tokens || 0, row.hit_rate || 0),
      createdAt: row.created_at,
    }));
  } catch {
    const rows = Array.from(telemetry.values()).flat();
    return rows
      .filter((row) => !options?.scope || row.scope === options.scope)
      .filter((row) => !options?.agentId || row.agentId === options.agentId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, options?.limit || 40)
      .map((row) => ({
        ...row,
        missReason: inferCacheMissReason(row.promptTokens, row.cachedPromptTokens, row.hitRate),
      }));
  }
}

function inferCacheMissReason(promptTokens: number, cachedPromptTokens: number, hitRate: number): string | undefined {
  if (promptTokens <= 0) return undefined;
  if (cachedPromptTokens <= 0) return 'cold_or_changed_prefix';
  if (hitRate < 70) return 'dynamic_context_pressure';
  if (hitRate < 90) return 'partial_prefix_reuse';
  return undefined;
}

function getBudgetPressure(rows: TelemetrySample[], averageHitRate: number): PromptCacheRuntimeStats['budgetPressure'] {
  if (rows.length < 2) return 'cold';
  if (averageHitRate >= TARGET_CACHE_HIT_RATE) return 'healthy';
  if (averageHitRate >= 70) return 'watch';
  return 'tighten';
}

function buildOptimizationAdvice(rows: TelemetrySample[], averageHitRate: number): PromptCacheOptimizationAdvice {
  if (rows.length === 0) {
    return {
      status: 'cold_start',
      title: '等待样本',
      detail: '还没有足够的云端调用样本，先保持默认预算。',
      actions: ['完成几次同 agent 的连续对话', '确认 provider 返回 usage.cached_tokens'],
    };
  }

  const lastMiss = [...rows].reverse().find((row) => row.missReason)?.missReason;
  if (averageHitRate >= TARGET_CACHE_HIT_RATE) {
    return {
      status: 'healthy',
      title: '缓存健康',
      detail: `平均命中率已达到 ${TARGET_CACHE_HIT_RATE}% 目标。`,
      actions: ['继续保持人格版本和工具集稳定', '只在必要时修改系统提示词'],
    };
  }

  if (lastMiss === 'cold_or_changed_prefix') {
    return {
      status: 'prefix_unstable',
      title: '前缀不稳定',
      detail: '最近样本没有复用到缓存，通常是 model、人格版本、工具集或系统提示词发生变化。',
      actions: ['减少人格快照频繁保存', '确认工具列表排序稳定', '同一 agent/model 连续测试至少 3 次'],
    };
  }

  if (lastMiss === 'dynamic_context_pressure' || averageHitRate < 70) {
    return {
      status: 'dynamic_pressure',
      title: '动态上下文压力',
      detail: '缓存可复用，但动态上下文占比偏高，系统会收紧记忆、最近上下文和 NLU 片段预算。',
      actions: ['压缩 recentContext', '刷新 agent memory digest', '把稳定人格规则放入 SOUL/TONE/BOUNDARIES'],
    };
  }

  return {
    status: 'partial_reuse',
    title: '部分复用',
    detail: '已有缓存复用，但仍低于目标命中率，需要继续收敛动态内容。',
    actions: ['保持同一 scope 连续调用', '减少用户画像和最近对话的重复文本', '观察下一轮 warm cache 命中'],
  };
}

function buildOverallStats(stats: PromptCacheRuntimeStats[]): PromptCacheRuntimeStats {
  const calls = stats.reduce((sum, stat) => sum + stat.calls, 0);
  const warmCalls = stats.reduce((sum, stat) => sum + stat.warmCalls, 0);
  const weightedHitRate = calls > 0
    ? Math.round((stats.reduce((sum, stat) => sum + stat.averageHitRate * stat.calls, 0) / calls) * 100) / 100
    : 0;
  return {
    scope: 'all',
    agentId: 'all',
    calls,
    warmCalls,
    lastHitRate: stats[0]?.lastHitRate || 0,
    averageHitRate: weightedHitRate,
    averagePromptTokens: Math.round(average(stats.map((stat) => stat.averagePromptTokens).filter((value) => value > 0))),
    averageCachedTokens: Math.round(average(stats.map((stat) => stat.averageCachedTokens).filter((value) => value > 0))),
    averageCompletionTokens: Math.round(average(stats.map((stat) => stat.averageCompletionTokens).filter((value) => value > 0))),
    targetHitRate: TARGET_CACHE_HIT_RATE,
    budgetPressure: stats.some((stat) => stat.budgetPressure === 'tighten')
      ? 'tighten'
      : stats.some((stat) => stat.budgetPressure === 'watch')
        ? 'watch'
        : stats.some((stat) => stat.budgetPressure === 'healthy')
          ? 'healthy'
          : 'cold',
    recommendedBudget: stats[0]?.recommendedBudget || { ...DEFAULT_DYNAMIC_BUDGET },
    advice: stats[0]?.advice || buildOptimizationAdvice([], 0),
  };
}

function buildCostSummary(rows: PromptCacheTelemetryRow[]): PromptCacheCostSummary {
  const promptTokens = rows.reduce((sum, row) => sum + row.promptTokens, 0);
  const cachedPromptTokens = rows.reduce((sum, row) => sum + row.cachedPromptTokens, 0);
  const completionTokens = rows.reduce((sum, row) => sum + row.completionTokens, 0);
  const savedPromptTokens = cachedPromptTokens;
  const cacheSavingsRate = promptTokens > 0
    ? Math.round((cachedPromptTokens / promptTokens) * 10000) / 100
    : 0;
  const estimatedCostUnits = Math.round((
    Math.max(0, promptTokens - cachedPromptTokens) +
    cachedPromptTokens * 0.1 +
    completionTokens
  ) * 100) / 100;
  const estimatedUncachedCostUnits = Math.round((promptTokens + completionTokens) * 100) / 100;
  const savedCostUnits = Math.round(Math.max(0, estimatedUncachedCostUnits - estimatedCostUnits) * 100) / 100;
  return {
    promptTokens,
    cachedPromptTokens,
    completionTokens,
    savedPromptTokens,
    cacheSavingsRate,
    estimatedUncachedCostUnits,
    estimatedCostUnits,
    savedCostUnits,
    pressure: estimatedCostUnits > 12000 ? 'high' : estimatedCostUnits > 5000 ? 'medium' : 'low',
  };
}

function hashForCache(text: string): string {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}
