import { getDatabase } from '../../core/database/database';
import { v4 as uuidv4 } from 'uuid';
import type { ToolEntry } from '../../agents/_shared/tool-registry';
import { getSecurityProfile } from '../../agents/_shared/security-profile';
import type { AgentId } from '../../shared/types';

export interface ToolExecutionResult {
  success: boolean;
  data?: unknown;
  error?: string;
  errorCode?: string;
  executionTimeMs: number;
  auditLogId: string;
}

export interface ToolExecutionOptions {
  agentId?: AgentId;
  userConfirmed?: boolean;
}

export async function executeTool(
  entry: ToolEntry,
  params: Record<string, unknown>,
  options: ToolExecutionOptions = {}
): Promise<ToolExecutionResult> {
  const startTime = Date.now();
  const agentId = options.agentId || 'master';

  const denial = getExecutionDenial(entry, agentId, options.userConfirmed === true);
  if (denial) {
    const executionTimeMs = Date.now() - startTime;
    const auditLogId = await logToolExecution({
      agent: agentId,
      tool: entry.definition.name,
      action: 'execute',
      params,
      resultStatus: 'rejected',
      errorCode: denial.code,
      executionTimeMs,
      permissionLevel: entry.definition.permissionLevel,
      userConfirmed: options.userConfirmed === true,
    });

    return {
      success: false,
      error: denial.message,
      errorCode: denial.code,
      executionTimeMs,
      auditLogId,
    };
  }

  try {
    const result = await Promise.race([
      entry.handler(params, { agentId }),
      new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(new Error(`Tool ${entry.definition.name} timed out after ${entry.definition.timeout}ms`)),
          entry.definition.timeout
        )
      ),
    ]);

    const executionTimeMs = Date.now() - startTime;

    const auditLogId = await logToolExecution({
      agent: agentId,
      tool: entry.definition.name,
      action: 'execute',
      params,
      resultStatus: result?.success === false ? 'error' : 'success',
      errorCode: result?.errorCode,
      executionTimeMs,
      permissionLevel: entry.definition.permissionLevel,
      userConfirmed: options.userConfirmed === true,
    });

    return {
      ...result,
      executionTimeMs,
      auditLogId,
    };
  } catch (e) {
    const executionTimeMs = Date.now() - startTime;
    const errorMessage = e instanceof Error ? e.message : 'Unknown error';

    const auditLogId = await logToolExecution({
      agent: agentId,
      tool: entry.definition.name,
      action: 'execute',
      params,
      resultStatus: errorMessage.includes('timed out') ? 'timeout' : 'error',
      errorCode: 'EXECUTION_ERROR',
      executionTimeMs,
      permissionLevel: entry.definition.permissionLevel,
      userConfirmed: options.userConfirmed === true,
    });

    return {
      success: false,
      error: errorMessage,
      errorCode: 'EXECUTION_ERROR',
      executionTimeMs,
      auditLogId,
    };
  }
}

export async function executeWithRetry(
  entry: ToolEntry,
  params: Record<string, unknown>,
  maxRetries: number = 3,
  options: ToolExecutionOptions = {}
): Promise<ToolExecutionResult> {
  let lastResult: ToolExecutionResult | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    lastResult = await executeTool(entry, params, options);

    if (lastResult.success || !entry.definition.retryable || attempt >= maxRetries) {
      return lastResult;
    }

    const delay = Math.min(1000 * Math.pow(2, attempt), 8000);
    await new Promise((resolve) => setTimeout(resolve, delay));
  }

  return lastResult!;
}

function getExecutionDenial(
  entry: ToolEntry,
  agentId: AgentId,
  userConfirmed: boolean
): { code: string; message: string } | null {
  const profile = getSecurityProfile(agentId);
  if (!profile) {
    return { code: 'UNKNOWN_AGENT', message: `未知 Agent: ${agentId}` };
  }
  if (!entry.allowedAgents.includes(agentId)) {
    return { code: 'AGENT_NOT_ALLOWED', message: `${agentId} 无权调用工具 ${entry.definition.name}` };
  }
  if (entry.definition.permissionLevel > profile.maxPermissionLevel) {
    return {
      code: 'PERMISSION_EXCEEDED',
      message: `${agentId} 权限 L${profile.maxPermissionLevel} 不足以调用 L${entry.definition.permissionLevel} 工具 ${entry.definition.name}`,
    };
  }
  if (entry.definition.permissionLevel === 2 && !userConfirmed) {
    return {
      code: 'CONFIRMATION_REQUIRED',
      message: `敏感工具 ${entry.definition.name} 需要用户显式确认`,
    };
  }
  return null;
}

async function logToolExecution(params: {
  agent: string;
  tool: string;
  action: string;
  params: Record<string, unknown>;
  resultStatus: 'success' | 'error' | 'rejected' | 'timeout';
  errorCode?: string;
  executionTimeMs: number;
  permissionLevel: number;
  userConfirmed: boolean;
}): Promise<string> {
  const id = uuidv4();
  try {
    const db = await getDatabase();
    const now = new Date().toISOString();
    const paramsHash = await hashParams(params.params);

    const prevRow = await db.getFirstAsync<{ hash: string }>(
      `SELECT hash FROM audit_log ORDER BY timestamp DESC, id DESC LIMIT 1`
    );
    const prevHash = prevRow?.hash || '';

    const entryHash = await computeAuditChainHash({
      id,
      timestamp: now,
      agent: params.agent,
      tool: params.tool,
      action: params.action,
      params_hash: paramsHash,
      result_status: params.resultStatus,
      prev_hash: prevHash,
    });

    await db.runAsync(
      `INSERT INTO audit_log (id, timestamp, agent, tool, action, params, params_hash, result_status, user_confirmed, error_code, permission_level, duration_ms, hash, prev_hash)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        now,
        params.agent,
        params.tool,
        params.action,
        null,
        paramsHash,
        params.resultStatus,
        params.userConfirmed ? 1 : 0,
        params.errorCode || null,
        params.permissionLevel,
        params.executionTimeMs,
        entryHash,
        prevHash,
      ]
    );
  } catch {
    // Non-critical, audit logging failure should not break tool execution
  }
  return id;
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const obj = value as Record<string, unknown>;
  return `{${Object.keys(obj).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(obj[key])}`).join(',')}}`;
}

let _cachedAuditHashSecret: string | null = null;

function getAuditHashSecret(): string {
  if (_cachedAuditHashSecret) return _cachedAuditHashSecret;

  const env = (globalThis as unknown as {
    process?: { env?: Record<string, string | undefined> };
  }).process?.env;

  const secret = env?.WEALTH_MANAGER_HASHCHAIN_KEY || env?.EXPO_PUBLIC_WEALTH_MANAGER_HASHCHAIN_KEY;
  if (secret) {
    _cachedAuditHashSecret = secret;
    return secret;
  }

  // Generate a random 32-byte key when no env var is configured
  const bytes = new Uint8Array(32);
  globalThis.crypto.getRandomValues(bytes);
  const generated = Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
  _cachedAuditHashSecret = generated;
  return generated;
}

async function hashParams(params: Record<string, unknown>): Promise<string> {
  const input = stableStringify(params);
  const webCrypto = getWebCryptoForHashing();
  const secret = getAuditHashSecret();
  const key = await webCrypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await webCrypto.subtle.sign('HMAC', key, new TextEncoder().encode(input));
  return Array.from(new Uint8Array(signature)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

function getWebCryptoForHashing(): Crypto {
  if (typeof globalThis.crypto?.subtle !== 'undefined') {
    return globalThis.crypto;
  }
  const nodeRequire = (globalThis as unknown as { require?: (moduleName: string) => unknown }).require;
  const nodeCrypto = nodeRequire?.('crypto') as { webcrypto?: Crypto } | undefined;
  if (nodeCrypto?.webcrypto?.subtle) {
    return nodeCrypto.webcrypto;
  }
  throw new Error('WebCrypto unavailable');
}

async function computeAuditChainHash(entry: {
  id: string;
  timestamp: string;
  agent: string;
  tool: string;
  action: string;
  params_hash: string;
  result_status: string;
  prev_hash: string;
}): Promise<string> {
  const payload = stableStringify({
    id: entry.id,
    timestamp: entry.timestamp,
    agent: entry.agent,
    tool: entry.tool,
    action: entry.action,
    params_hash: entry.params_hash,
    result_status: entry.result_status,
    prev_hash: entry.prev_hash,
  });
  const webCrypto = getWebCryptoForHashing();
  const secret = getAuditHashSecret();
  const key = await webCrypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await webCrypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload));
  return Array.from(new Uint8Array(signature)).map((b) => b.toString(16).padStart(2, '0')).join('');
}
