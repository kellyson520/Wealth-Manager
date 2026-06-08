import { v4 as uuidv4 } from 'uuid';
import { getDatabase } from '../../core/database/database';
import { captureError } from '../../core/logger/logger';
import { isNluLearningEnabled } from '../../core/memory/adaptive-context';
import type { IntentResult } from '../../shared/types';

export type NluLearningSource = 'cloud_function' | 'user_feedback' | 'test';

export interface NluLearningSample {
  id: string;
  text: string;
  normalizedText: string;
  intent: string;
  agent: string;
  params: Record<string, unknown>;
  source: NluLearningSource;
  confidence: number;
  hits: number;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface LearnIntentAliasParams {
  text: string;
  intent: string;
  agent: string;
  params?: Record<string, unknown>;
  source?: NluLearningSource;
  confidence?: number;
}

const MIN_ALIAS_LENGTH = 2;
const MAX_ALIAS_LENGTH = 120;
const HIGH_CONFIDENCE_STATIC_MATCH = 0.85;
const LOW_CONFIDENCE_MATCH = 0.6;

const learnedSamples: NluLearningSample[] = [];
let loaded = false;

export function normalizeNluText(text: string): string {
  return text
    .replace(/[，。,.！？!?、；;：:\s"'“”‘’（）()【】\[\]{}<>《》]/g, '')
    .trim()
    .toLowerCase();
}

export function resetNluLearningForTest(): void {
  learnedSamples.length = 0;
  loaded = false;
}

export function addNluLearningSampleForTest(sample: LearnIntentAliasParams): void {
  const normalizedText = normalizeNluText(sample.text);
  if (!canLearnAlias(normalizedText, sample.intent)) return;
  upsertMemorySample({
    id: uuidv4(),
    text: sample.text,
    normalizedText,
    intent: sample.intent,
    agent: sample.agent,
    params: sanitizeLearnedParams(sample.params || {}),
    source: sample.source || 'test',
    confidence: sample.confidence || 0.9,
    hits: 1,
    enabled: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
  loaded = true;
}

export async function loadNluLearningSamples(): Promise<void> {
  if (loaded) return;
  try {
    const db = await getDatabase();
    const rows = await db.getAllAsync<{
      id: string;
      phrase: string;
      normalized_text: string;
      intent: string;
      agent: string;
      params: string;
      source: string;
      confidence: number;
      hits: number;
      enabled: number;
      created_at: string;
      updated_at: string;
    }>(
      `SELECT id, phrase, normalized_text, intent, agent, params, source, confidence, hits, enabled, created_at, updated_at
       FROM nlu_learning_samples
       WHERE enabled = 1
       ORDER BY hits DESC, updated_at DESC
       LIMIT 200`
    );

    learnedSamples.length = 0;
    for (const row of rows) {
      learnedSamples.push({
        id: row.id,
        text: row.phrase,
        normalizedText: row.normalized_text,
        intent: row.intent,
        agent: row.agent,
        params: sanitizeLearnedParams(safeParseParams(row.params)),
        source: normalizeSource(row.source),
        confidence: row.confidence,
        hits: row.hits,
        enabled: row.enabled === 1,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      });
    }
    loaded = true;
  } catch (e) {
    loaded = true;
    captureError('nlu_learning.load', e, 'Failed to load NLU learning samples');
  }
}

export async function learnIntentAlias(params: LearnIntentAliasParams): Promise<void> {
  if (!(await isNluLearningEnabled())) return;
  const normalizedText = normalizeNluText(params.text);
  if (!canLearnAlias(normalizedText, params.intent)) return;

  const now = new Date().toISOString();
  const sample: NluLearningSample = {
    id: uuidv4(),
    text: params.text.trim(),
    normalizedText,
    intent: params.intent,
    agent: params.agent,
    params: sanitizeLearnedParams(params.params || {}),
    source: params.source || 'cloud_function',
    confidence: clampConfidence(params.confidence ?? 0.82),
    hits: 1,
    enabled: true,
    createdAt: now,
    updatedAt: now,
  };

  upsertMemorySample(sample);

  try {
    const db = await getDatabase();
    await db.runAsync(
      `INSERT INTO nlu_learning_samples
       (id, phrase, normalized_text, intent, agent, params, source, confidence, hits, enabled, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, 1, ?, ?)
       ON CONFLICT(normalized_text, intent) DO UPDATE SET
         phrase = excluded.phrase,
         agent = excluded.agent,
         params = excluded.params,
         source = excluded.source,
         confidence = MAX(nlu_learning_samples.confidence, excluded.confidence),
         hits = nlu_learning_samples.hits + 1,
         enabled = 1,
         updated_at = excluded.updated_at`,
      [
        sample.id,
        sample.text,
        sample.normalizedText,
        sample.intent,
        sample.agent,
        JSON.stringify(sample.params),
        sample.source,
        sample.confidence,
        now,
        now,
      ]
    );
  } catch (e) {
    captureError('nlu_learning.learn', e, 'Failed to persist NLU learning sample');
  }
}

export function applyLearnedIntent(text: string, base: IntentResult): IntentResult {
  if (learnedSamples.length === 0) return base;
  const normalizedText = normalizeNluText(text);
  if (!normalizedText) return base;

  const exact = learnedSamples.find((sample) => sample.enabled && sample.normalizedText === normalizedText);
  if (exact) {
    return sampleToIntent(exact, base, 0.94);
  }

  if (base.intent !== 'unknown' && base.confidence >= HIGH_CONFIDENCE_STATIC_MATCH) {
    return base;
  }

  const fuzzy = learnedSamples
    .filter((sample) => sample.enabled && sample.normalizedText.length >= 4)
    .find((sample) => normalizedText.includes(sample.normalizedText) || sample.normalizedText.includes(normalizedText));

  if (fuzzy && (base.intent === 'unknown' || base.confidence < LOW_CONFIDENCE_MATCH)) {
    return sampleToIntent(fuzzy, base, 0.86);
  }

  return base;
}

export function inferIntentFromToolCall(
  toolName: string,
  args: Record<string, unknown>
): { intent: string; agent: string; params: Record<string, unknown> } | null {
  switch (toolName) {
    case 'add_bill':
      return {
        intent: args.type === 'income' ? 'add_income' : 'add_expense',
        agent: 'ledger',
        params: args,
      };
    case 'search_bills':
      return { intent: 'search_bills', agent: 'ledger', params: args };
    case 'modify_bill':
      return { intent: 'modify_bill', agent: 'ledger', params: args };
    case 'delete_bill':
      return { intent: 'delete_bill', agent: 'guardian', params: args };
    case 'get_aggregation':
      return { intent: 'get_summary', agent: 'analyst', params: args };
    case 'generate_chart_config':
      return { intent: 'get_chart', agent: 'analyst', params: args };
    case 'set_budget':
      return { intent: 'set_budget', agent: 'coach', params: args };
    case 'create_savings_goal':
      return { intent: 'create_savings_goal', agent: 'coach', params: args };
    case 'get_savings_progress':
      return { intent: 'get_savings', agent: 'coach', params: args };
    case 'add_asset':
      return { intent: 'add_asset', agent: 'ledger', params: args };
    case 'list_assets':
      return { intent: 'list_assets', agent: 'ledger', params: args };
    case 'add_debt':
      return { intent: 'add_debt', agent: 'ledger', params: args };
    case 'list_debts':
      return { intent: 'list_debts', agent: 'ledger', params: args };
    case 'create_reimbursement':
      return { intent: 'reimbursement', agent: 'ledger', params: args };
    case 'add_credit_card':
      return { intent: 'credit_card', agent: 'ledger', params: args };
    case 'create_reminder':
    case 'schedule_notification':
      return { intent: 'create_reminder', agent: 'guardian', params: args };
    case 'sync_upload':
    case 'sync_download':
      return { intent: 'sync_webdav', agent: 'guardian', params: args };
    case 'list_ai_memories':
    case 'delete_ai_memory':
    case 'update_ai_persona':
    case 'set_ai_learning_enabled':
      return { intent: toolName, agent: 'master', params: args };
    default:
      return null;
  }
}

function upsertMemorySample(sample: NluLearningSample): void {
  const index = learnedSamples.findIndex(
    (existing) => existing.normalizedText === sample.normalizedText && existing.intent === sample.intent
  );
  if (index >= 0) {
    learnedSamples[index] = {
      ...learnedSamples[index],
      ...sample,
      hits: learnedSamples[index].hits + 1,
      confidence: Math.max(learnedSamples[index].confidence, sample.confidence),
      updatedAt: sample.updatedAt,
    };
    return;
  }
  learnedSamples.unshift(sample);
  if (learnedSamples.length > 200) learnedSamples.length = 200;
}

function sampleToIntent(sample: NluLearningSample, base: IntentResult, confidenceFloor: number): IntentResult {
  return {
    intent: sample.intent,
    agent: sample.agent,
    params: { ...sample.params, ...stripUndefinedParams(base.params) },
    confidence: Math.max(confidenceFloor, Math.min(0.97, sample.confidence + Math.min(sample.hits, 8) * 0.005)),
  };
}

function stripUndefinedParams(params: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(params).filter(([, value]) => value !== undefined)
  );
}

function sanitizeLearnedParams(params: Record<string, unknown>): Record<string, unknown> {
  const { confirmed, userConfirmed, ...safeParams } = params;
  return safeParams;
}

function canLearnAlias(normalizedText: string, intent: string): boolean {
  return (
    normalizedText.length >= MIN_ALIAS_LENGTH &&
    normalizedText.length <= MAX_ALIAS_LENGTH &&
    intent.length > 0 &&
    intent !== 'unknown'
  );
}

function safeParseParams(raw: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(raw || '{}');
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {};
  } catch {
    return {};
  }
}

function normalizeSource(source: string): NluLearningSource {
  return source === 'user_feedback' || source === 'test' ? source : 'cloud_function';
}

function clampConfidence(value: number): number {
  return Math.min(0.97, Math.max(0.5, value));
}
