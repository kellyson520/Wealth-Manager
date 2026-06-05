import { v4 as uuidv4 } from 'uuid';
import { getDatabase } from '../database/database';
import { captureError } from '../logger/logger';
import type { AgentId } from '../../shared/types';

export interface PersonaSnapshot {
  id: string;
  version: number;
  soul: string;
  toneRules: string[];
  boundaries: string[];
  source: string;
  createdAt: string;
  updatedAt: string;
}

export interface UserProfileMemory {
  id: string;
  key: string;
  value: string;
  confidence: number;
  source: string;
  createdAt: string;
  updatedAt: string;
}

export type AiMemoryKind = 'user_profile' | 'memory_engine' | 'nlu_learning';

export interface AiMemoryView {
  id: string;
  kind: AiMemoryKind;
  content: string;
  confidence?: number;
  source?: string;
  updatedAt: string;
}

const DEFAULT_SOUL = [
  '你是 Wealth Manager 的财务助理 Agent。',
  '你以清晰、克制、可靠的方式帮助用户完成记账、预算、资产、提醒和财务分析。',
  '你优先保护隐私与安全；涉及敏感数据、删除、外部同步和高风险操作时必须谨慎。',
  '你会把成功的工具调用、用户偏好和稳定事实沉淀为可审计记忆，但不会保存密钥、证件号、银行卡号等敏感原文。',
].join('\n');

const DEFAULT_TONE_RULES = [
  '默认使用简洁中文回答。',
  '先给结论，再给必要细节。',
  '财务建议保持审慎，不夸大收益。',
];

const DEFAULT_BOUNDARIES = [
  '不编造不存在的账单或资产。',
  '不在未确认时执行 L2 敏感操作。',
  '不把敏感原文发送到云端。',
];

export async function getPersonaSnapshot(): Promise<PersonaSnapshot> {
  const db = await getDatabase();
  await ensureDefaultPersonaSnapshot();
  const row = await db.getFirstAsync<{
    id: string;
    version: number;
    soul: string;
    tone_rules: string;
    boundaries: string;
    source: string;
    created_at: string;
    updated_at: string;
  }>('SELECT * FROM persona_snapshots ORDER BY version DESC, updated_at DESC LIMIT 1');

  return rowToPersona(row);
}

export async function updatePersonaSnapshot(params: {
  soul?: string;
  toneRules?: string[];
  boundaries?: string[];
  source?: string;
}): Promise<PersonaSnapshot> {
  const current = await getPersonaSnapshot();
  const db = await getDatabase();
  const now = new Date().toISOString();
  const snapshot: PersonaSnapshot = {
    id: uuidv4(),
    version: current.version + 1,
    soul: normalizeTextBlock(params.soul) || current.soul,
    toneRules: sanitizeList(params.toneRules, current.toneRules),
    boundaries: sanitizeList(params.boundaries, current.boundaries),
    source: params.source || 'user',
    createdAt: now,
    updatedAt: now,
  };

  await db.runAsync(
    `INSERT INTO persona_snapshots (id, version, soul, tone_rules, boundaries, source, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      snapshot.id,
      snapshot.version,
      snapshot.soul,
      JSON.stringify(snapshot.toneRules),
      JSON.stringify(snapshot.boundaries),
      snapshot.source,
      now,
      now,
    ]
  );

  return snapshot;
}

export async function upsertUserProfileMemory(params: {
  key: string;
  value: string;
  confidence?: number;
  source?: string;
}): Promise<UserProfileMemory | null> {
  const key = params.key.trim();
  const value = params.value.trim();
  if (!key || !value || key.length > 80 || value.length > 500) return null;

  const db = await getDatabase();
  const now = new Date().toISOString();
  const id = uuidv4();
  const confidence = clamp(params.confidence ?? 0.7, 0.1, 1);
  await db.runAsync(
    `INSERT INTO user_profile_memory (id, key, value, confidence, source, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET
       value = excluded.value,
       confidence = MAX(user_profile_memory.confidence, excluded.confidence),
       source = excluded.source,
       updated_at = excluded.updated_at`,
    [id, key, value, confidence, params.source || 'agent', now, now]
  );

  return {
    id,
    key,
    value,
    confidence,
    source: params.source || 'agent',
    createdAt: now,
    updatedAt: now,
  };
}

export async function listAiMemories(params: {
  kind?: AiMemoryKind;
  limit?: number;
} = {}): Promise<AiMemoryView[]> {
  const limit = Math.min(Math.max(params.limit || 20, 1), 80);
  const result: AiMemoryView[] = [];
  const db = await getDatabase();

  if (!params.kind || params.kind === 'user_profile') {
    const rows = await db.getAllAsync<{
      id: string; key: string; value: string; confidence: number; source: string; updated_at: string;
    }>(
      'SELECT id, key, value, confidence, source, updated_at FROM user_profile_memory ORDER BY confidence DESC, updated_at DESC LIMIT ?',
      [limit]
    );
    result.push(...rows.map((row) => ({
      id: row.id,
      kind: 'user_profile' as const,
      content: `${row.key}: ${row.value}`,
      confidence: row.confidence,
      source: row.source,
      updatedAt: row.updated_at,
    })));
  }

  if (!params.kind || params.kind === 'memory_engine') {
    const rows = await db.getAllAsync<{
      id: string; type: string; content: string; importance: number; created_at: string;
    }>(
      `SELECT id, type, content, importance, created_at
       FROM memory_engine
       WHERE layer IN ('long_term','semantic')
       ORDER BY importance DESC, access_count DESC, created_at DESC
       LIMIT ?`,
      [limit]
    );
    result.push(...rows.map((row) => ({
      id: row.id,
      kind: 'memory_engine' as const,
      content: `${row.type}: ${row.content}`,
      confidence: row.importance,
      source: 'memory_engine',
      updatedAt: row.created_at,
    })));
  }

  if (!params.kind || params.kind === 'nlu_learning') {
    const rows = await db.getAllAsync<{
      id: string; phrase: string; intent: string; confidence: number; source: string; updated_at: string;
    }>(
      `SELECT id, phrase, intent, confidence, source, updated_at
       FROM nlu_learning_samples
       WHERE enabled = 1
       ORDER BY hits DESC, confidence DESC, updated_at DESC
       LIMIT ?`,
      [limit]
    );
    result.push(...rows.map((row) => ({
      id: row.id,
      kind: 'nlu_learning' as const,
      content: `${row.phrase} -> ${row.intent}`,
      confidence: row.confidence,
      source: row.source,
      updatedAt: row.updated_at,
    })));
  }

  return result
    .sort((a, b) => (b.confidence || 0) - (a.confidence || 0))
    .slice(0, limit);
}

export async function deleteAiMemory(id: string, kind: AiMemoryKind): Promise<boolean> {
  if (!id) return false;
  const db = await getDatabase();
  if (kind === 'user_profile') {
    const result = await db.runAsync('DELETE FROM user_profile_memory WHERE id = ?', [id]);
    return (result.changes || 0) > 0;
  }
  if (kind === 'memory_engine') {
    const result = await db.runAsync('DELETE FROM memory_engine WHERE id = ?', [id]);
    return (result.changes || 0) > 0;
  }
  const result = await db.runAsync('UPDATE nlu_learning_samples SET enabled = 0, updated_at = ? WHERE id = ?', [
    new Date().toISOString(),
    id,
  ]);
  return (result.changes || 0) > 0;
}

export async function setNluLearningEnabled(enabled: boolean): Promise<boolean> {
  const db = await getDatabase();
  const now = new Date().toISOString();
  await db.runAsync(
    `INSERT INTO nlu_learning_settings (key, value, updated_at)
     VALUES ('enabled', ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    [enabled ? 'true' : 'false', now]
  );
  return enabled;
}

export async function isNluLearningEnabled(): Promise<boolean> {
  try {
    const db = await getDatabase();
    const row = await db.getFirstAsync<{ value: string }>(
      "SELECT value FROM nlu_learning_settings WHERE key = 'enabled'"
    );
    return row?.value !== 'false';
  } catch (e) {
    captureError('adaptive_context.learning', e, 'Failed to read NLU learning setting');
    return true;
  }
}

export async function buildAdaptiveContextPrompt(agentId: AgentId = 'master'): Promise<string> {
  try {
    const [persona, profileMemories, memoryDigest] = await Promise.all([
      getPersonaSnapshot(),
      listUserProfilePromptItems(8),
      buildMemoryDigest(agentId, 8),
    ]);

    const sections = [
      `## SOUL\n${persona.soul}`,
      `## TONE_RULES\n${formatList(persona.toneRules)}`,
      `## BOUNDARIES\n${formatList(persona.boundaries)}`,
      `## USER\n${profileMemories.length > 0 ? profileMemories.join('\n') : '- 暂无稳定用户偏好记忆'}`,
      `## MEMORY\n${memoryDigest || '- 暂无可用长期记忆摘要'}`,
    ];

    return sections.join('\n\n');
  } catch (e) {
    captureError('adaptive_context.prompt', e, 'Failed to build adaptive context prompt');
    return '';
  }
}

export async function refreshAgentMemoryDigest(agentId: AgentId, tokenBudget: number = 1000): Promise<string> {
  const digest = await buildMemoryDigest(agentId, 12);
  const db = await getDatabase();
  const now = new Date().toISOString();
  await db.runAsync(
    `INSERT INTO agent_memory_digest (id, agent_id, digest, token_budget, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [uuidv4(), agentId, digest, tokenBudget, now, now]
  );
  return digest;
}

async function ensureDefaultPersonaSnapshot(): Promise<void> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{ id: string }>('SELECT id FROM persona_snapshots LIMIT 1');
  if (row) return;
  const now = new Date().toISOString();
  await db.runAsync(
    `INSERT INTO persona_snapshots (id, version, soul, tone_rules, boundaries, source, created_at, updated_at)
     VALUES (?, 1, ?, ?, ?, 'system', ?, ?)`,
    [uuidv4(), DEFAULT_SOUL, JSON.stringify(DEFAULT_TONE_RULES), JSON.stringify(DEFAULT_BOUNDARIES), now, now]
  );
}

async function listUserProfilePromptItems(limit: number): Promise<string[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<{
    key: string; value: string; confidence: number;
  }>(
    'SELECT key, value, confidence FROM user_profile_memory ORDER BY confidence DESC, updated_at DESC LIMIT ?',
    [limit]
  );
  return rows.map((row) => `- ${row.key}: ${row.value} (${Math.round(row.confidence * 100)}%)`);
}

async function buildMemoryDigest(agentId: AgentId, limit: number): Promise<string> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<{
    type: string; content: string; importance: number;
  }>(
    `SELECT type, content, importance
     FROM memory_engine
     WHERE agent_id = ? AND layer IN ('long_term','semantic')
     ORDER BY importance DESC, access_count DESC, created_at DESC
     LIMIT ?`,
    [agentId, limit]
  );
  return rows
    .map((row) => `- ${row.type}: ${trimForPrompt(row.content, 140)} (${Math.round(row.importance * 100)}%)`)
    .join('\n');
}

function rowToPersona(row?: {
  id: string;
  version: number;
  soul: string;
  tone_rules: string;
  boundaries: string;
  source: string;
  created_at: string;
  updated_at: string;
} | null): PersonaSnapshot {
  if (!row) {
    const now = new Date().toISOString();
    return {
      id: 'default',
      version: 1,
      soul: DEFAULT_SOUL,
      toneRules: DEFAULT_TONE_RULES,
      boundaries: DEFAULT_BOUNDARIES,
      source: 'system',
      createdAt: now,
      updatedAt: now,
    };
  }
  return {
    id: row.id,
    version: row.version,
    soul: row.soul,
    toneRules: safeParseStringArray(row.tone_rules, DEFAULT_TONE_RULES),
    boundaries: safeParseStringArray(row.boundaries, DEFAULT_BOUNDARIES),
    source: row.source,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function safeParseStringArray(raw: string, fallback: string[]): string[] {
  try {
    const parsed = JSON.parse(raw || '[]');
    return Array.isArray(parsed) ? parsed.filter((item) => typeof item === 'string') : fallback;
  } catch {
    return fallback;
  }
}

function sanitizeList(value: string[] | undefined, fallback: string[]): string[] {
  if (!value) return fallback;
  const clean = value
    .map((item) => normalizeTextBlock(item))
    .filter((item): item is string => Boolean(item))
    .slice(0, 12);
  return clean.length > 0 ? clean : fallback;
}

function normalizeTextBlock(value?: string): string {
  return (value || '').replace(/\s+/g, ' ').trim().slice(0, 1600);
}

function formatList(items: string[]): string {
  return items.map((item) => `- ${item}`).join('\n');
}

function trimForPrompt(value: string, maxLength: number): string {
  const normalized = value.replace(/\s+/g, ' ').trim();
  return normalized.length > maxLength ? `${normalized.slice(0, maxLength)}...` : normalized;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
