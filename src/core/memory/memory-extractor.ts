import type { AgentId } from '../../shared/types';
import { detectPII } from '../cloud/sanitizer';
import { captureError } from '../logger/logger';
import { storeMemory } from './memory-engine';
import { upsertUserProfileMemory } from './adaptive-context';

export interface ExtractedUserPreference {
  key: string;
  value: string;
  confidence: number;
}

const EXPLICIT_MEMORY_PATTERNS = [
  /(?:请)?记住[：:\s]*(.+)/,
  /以后(?:都|请|帮我)?[：:\s]*(.+)/,
  /我(?:喜欢|偏好|习惯|希望)[：:\s]*(.+)/,
  /(?:回复|回答|提醒)(?:我)?(?:时)?(?:请)?[：:\s]*(.+)/,
];

const SENSITIVE_KEYWORDS = /(密码|密钥|token|api\s*key|银行卡|身份证|手机号|验证码|私钥|助记词)/i;

export function extractUserPreference(text: string): ExtractedUserPreference | null {
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (normalized.length < 4 || normalized.length > 500) return null;
  if (SENSITIVE_KEYWORDS.test(normalized)) return null;
  if (detectPII(normalized).hasPII) return null;

  for (const pattern of EXPLICIT_MEMORY_PATTERNS) {
    const match = normalized.match(pattern);
    const value = match?.[1]?.trim();
    if (!value || value.length < 2) continue;
    return {
      key: inferPreferenceKey(normalized),
      value: cleanupPreferenceValue(value),
      confidence: pattern.source.includes('记住') ? 0.9 : 0.78,
    };
  }

  return null;
}

export async function maybeStoreUserPreferenceFromText(
  text: string,
  source: string = 'user'
): Promise<ExtractedUserPreference | null> {
  const preference = extractUserPreference(text);
  if (!preference) return null;

  try {
    const stored = await upsertUserProfileMemory({
      key: preference.key,
      value: preference.value,
      confidence: preference.confidence,
      source,
    });
    return stored ? preference : null;
  } catch (e) {
    captureError('memory_extractor.preference', e, 'Failed to store extracted preference');
    return null;
  }
}

export async function recordToolProcedureMemory(params: {
  agentId?: AgentId;
  userText: string;
  toolName: string;
  args?: Record<string, unknown>;
}): Promise<void> {
  const normalizedText = params.userText.replace(/\s+/g, ' ').trim();
  if (normalizedText.length < 2 || normalizedText.length > 300) return;
  if (SENSITIVE_KEYWORDS.test(normalizedText) || detectPII(normalizedText).hasPII) return;

  try {
    await storeMemory({
      layer: 'semantic',
      type: 'pattern',
      agentId: params.agentId || 'master',
      content: `工具经验: 用户表达「${normalizedText}」 -> ${params.toolName}`,
      metadata: {
        toolName: params.toolName,
        args: sanitizeArgs(params.args || {}),
        source: 'tool_success',
      },
      importance: 0.62,
      tags: ['procedural', 'tool_success', params.toolName],
    });
  } catch (e) {
    captureError('memory_extractor.procedure', e, 'Failed to record tool procedure memory');
  }
}

function inferPreferenceKey(text: string): string {
  if (/(回复|回答|简洁|详细|语气|中文|英文)/.test(text)) return '沟通偏好';
  if (/(提醒|通知|闹钟|每天|每周|每月)/.test(text)) return '提醒偏好';
  if (/(预算|超支|消费|少买|控制)/.test(text)) return '预算偏好';
  if (/(风险|保守|激进|投资)/.test(text)) return '风险偏好';
  return '用户偏好';
}

function cleanupPreferenceValue(value: string): string {
  return value
    .replace(/^(?:我|请|帮我|都|要|希望)/, '')
    .replace(/[。！？!?]+$/g, '')
    .trim()
    .slice(0, 300);
}

function sanitizeArgs(args: Record<string, unknown>): Record<string, unknown> {
  const allowed = ['amount', 'type', 'category', 'period', 'chartType', 'name', 'enabled'];
  const result: Record<string, unknown> = {};
  for (const key of allowed) {
    if (key in args) result[key] = args[key];
  }
  return result;
}
