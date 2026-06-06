import type { AgentId, ToolResult } from '../../shared/types';
import { getPromptCacheDashboard } from '../../core/cloud/prompt-cache';
import { setPersonaParams } from '../../core/persona/persona-engine';
import {
  AiMemoryKind,
  deleteAiMemory,
  getPersonaSnapshot,
  listAiMemories,
  refreshAgentMemoryDigest,
  setNluLearningEnabled,
  updatePersonaSnapshot,
  upsertUserProfileMemory,
} from '../../core/memory/adaptive-context';
import { captureError } from '../../core/logger/logger';

const AI_MEMORY_KINDS = new Set<AiMemoryKind>(['user_profile', 'memory_engine', 'nlu_learning']);

export async function list_ai_memories(params?: {
  kind?: AiMemoryKind;
  limit?: number;
}): Promise<ToolResult> {
  try {
    const memories = await listAiMemories({
      kind: params?.kind,
      limit: params?.limit || 20,
    });
    return { success: true, data: memories };
  } catch (e) {
    captureError('list_ai_memories', e, 'Failed to list AI memories');
    return { success: false, error: '查询 AI 记忆失败' };
  }
}

export async function delete_ai_memory(params: {
  id: string;
  kind: AiMemoryKind;
}): Promise<ToolResult> {
  try {
    if (!params.id || !isAiMemoryKind(params.kind)) {
      return { success: false, error: '请提供记忆ID和类型' };
    }
    const deleted = await deleteAiMemory(params.id, params.kind);
    return deleted
      ? { success: true, data: { id: params.id, kind: params.kind } }
      : { success: false, error: '没有找到这条记忆' };
  } catch (e) {
    captureError('delete_ai_memory', e, 'Failed to delete AI memory');
    return { success: false, error: '删除 AI 记忆失败' };
  }
}

export async function update_ai_persona(params: {
  rigor?: unknown;
  humor?: unknown;
  proactivity?: unknown;
  soul?: unknown;
  toneRules?: unknown;
  boundaries?: unknown;
}): Promise<ToolResult> {
  try {
    const rigor = normalizePersonaScore(params.rigor);
    const humor = normalizePersonaScore(params.humor);
    const proactivity = normalizePersonaScore(params.proactivity);
    if (rigor === null || humor === null || proactivity === null) {
      return { success: false, error: '人格参数必须是 0-10 的数字' };
    }

    const soul = typeof params.soul === 'string' ? params.soul.trim() : undefined;
    const toneRules = normalizeRuleList(params.toneRules);
    const boundaries = normalizeRuleList(params.boundaries);
    const hasPersonaParams = rigor !== undefined || humor !== undefined || proactivity !== undefined;
    const hasSnapshotParams = Boolean(soul) || toneRules !== undefined || boundaries !== undefined;

    if (
      !hasPersonaParams &&
      !hasSnapshotParams
    ) {
      return { success: false, error: '请提供要更新的人格参数或 SOUL 内容' };
    }

    const personaParams = await setPersonaParams({
      rigor,
      humor,
      proactivity,
    });
    const snapshot = hasSnapshotParams
      ? await updatePersonaSnapshot({
        soul,
        toneRules,
        boundaries,
        source: 'user',
      })
      : await getPersonaSnapshot();

    return {
      success: true,
      data: {
        personaParams,
        snapshot,
      },
    };
  } catch (e) {
    captureError('update_ai_persona', e, 'Failed to update AI persona');
    return { success: false, error: '更新 AI 人格失败' };
  }
}

export async function remember_user_preference(params: {
  key: unknown;
  value: unknown;
  confidence?: unknown;
}): Promise<ToolResult> {
  try {
    if (
      typeof params.key !== 'string' ||
      typeof params.value !== 'string' ||
      (params.confidence !== undefined && (typeof params.confidence !== 'number' || !Number.isFinite(params.confidence)))
    ) {
      return { success: false, error: '偏好键、偏好内容或置信度格式不正确' };
    }
    const memory = await upsertUserProfileMemory({
      key: params.key,
      value: params.value,
      confidence: params.confidence ?? 0.8,
      source: 'user',
    });
    if (!memory) return { success: false, error: '偏好内容无效或过长' };
    return { success: true, data: memory };
  } catch (e) {
    captureError('remember_user_preference', e, 'Failed to remember user preference');
    return { success: false, error: '保存用户偏好失败' };
  }
}

export async function set_ai_learning_enabled(params: {
  enabled: unknown;
}): Promise<ToolResult> {
  try {
    if (typeof params.enabled !== 'boolean') {
      return { success: false, error: '学习开关必须是布尔值' };
    }
    const enabled = await setNluLearningEnabled(params.enabled);
    return { success: true, data: { enabled } };
  } catch (e) {
    captureError('set_ai_learning_enabled', e, 'Failed to update AI learning setting');
    return { success: false, error: '更新学习开关失败' };
  }
}

export async function refresh_ai_memory_digest(params?: {
  agentId?: AgentId;
  tokenBudget?: number;
}): Promise<ToolResult> {
  try {
    const digest = await refreshAgentMemoryDigest(params?.agentId || 'master', params?.tokenBudget || 1000);
    return { success: true, data: { digest } };
  } catch (e) {
    captureError('refresh_ai_memory_digest', e, 'Failed to refresh AI memory digest');
    return { success: false, error: '刷新 AI 记忆摘要失败' };
  }
}

export async function get_ai_cache_stats(params?: {
  agentId?: AgentId;
  scope?: string;
  limit?: number;
}): Promise<ToolResult> {
  try {
    const dashboard = await getPromptCacheDashboard({
      agentId: params?.agentId,
      scope: params?.scope,
      limit: params?.limit || 20,
    });
    return { success: true, data: dashboard };
  } catch (e) {
    captureError('get_ai_cache_stats', e, 'Failed to get AI cache stats');
    return { success: false, error: '查询 AI 缓存运行状态失败' };
  }
}

function isAiMemoryKind(value: unknown): value is AiMemoryKind {
  return typeof value === 'string' && AI_MEMORY_KINDS.has(value as AiMemoryKind);
}

function normalizePersonaScore(value: unknown): number | undefined | null {
  if (value === undefined) return undefined;
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return Math.max(0, Math.min(10, value));
}

function normalizeRuleList(value: unknown): string[] | undefined {
  if (value === undefined) return undefined;
  const rawItems = Array.isArray(value)
    ? value
    : typeof value === 'string'
      ? value.split(/\r?\n|[；;]/)
      : [];
  const clean = rawItems
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .slice(0, 12);
  return clean.length > 0 ? clean : undefined;
}
