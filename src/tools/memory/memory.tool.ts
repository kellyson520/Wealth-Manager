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
    if (!params.id || !params.kind) {
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
  rigor?: number;
  humor?: number;
  proactivity?: number;
  soul?: string;
  toneRules?: string[];
  boundaries?: string[];
}): Promise<ToolResult> {
  try {
    if (
      params.rigor === undefined &&
      params.humor === undefined &&
      params.proactivity === undefined &&
      !params.soul &&
      !params.toneRules &&
      !params.boundaries
    ) {
      return { success: false, error: '请提供要更新的人格参数或 SOUL 内容' };
    }

    const personaParams = await setPersonaParams({
      rigor: params.rigor,
      humor: params.humor,
      proactivity: params.proactivity,
    });
    const snapshot = params.soul || params.toneRules || params.boundaries
      ? await updatePersonaSnapshot({
        soul: params.soul,
        toneRules: params.toneRules,
        boundaries: params.boundaries,
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
  key: string;
  value: string;
  confidence?: number;
}): Promise<ToolResult> {
  try {
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
  enabled: boolean;
}): Promise<ToolResult> {
  try {
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
