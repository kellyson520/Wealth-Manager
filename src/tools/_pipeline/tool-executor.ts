import { getDatabase } from '../../core/database/database';
import { v4 as uuidv4 } from 'uuid';
import type { ToolEntry } from '../../agents/_shared/tool-registry';

export interface ToolExecutionResult {
  success: boolean;
  data?: unknown;
  error?: string;
  errorCode?: string;
  executionTimeMs: number;
  auditLogId: string;
}

export async function executeTool(
  entry: ToolEntry,
  params: Record<string, unknown>
): Promise<ToolExecutionResult> {
  const startTime = Date.now();
  const agentId = 'master';

  try {
    const result = await Promise.race([
      entry.handler(params),
      new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(new Error(`Tool ${entry.definition.name} timed out after ${entry.definition.timeout}ms`)),
          entry.definition.timeout
        )
      ),
    ]);

    const executionTimeMs = Date.now() - startTime;

    await logToolExecution({
      agent: agentId,
      tool: entry.definition.name,
      action: 'execute',
      params,
      resultStatus: result?.success === false ? 'error' : 'success',
      errorCode: result?.errorCode,
      executionTimeMs,
    });

    return {
      ...result,
      executionTimeMs,
      auditLogId: '',
    };
  } catch (e) {
    const executionTimeMs = Date.now() - startTime;
    const errorMessage = e instanceof Error ? e.message : 'Unknown error';

    await logToolExecution({
      agent: agentId,
      tool: entry.definition.name,
      action: 'execute',
      params,
      resultStatus: errorMessage.includes('timed out') ? 'timeout' : 'error',
      errorCode: 'EXECUTION_ERROR',
      executionTimeMs,
    });

    return {
      success: false,
      error: errorMessage,
      executionTimeMs,
      auditLogId: '',
    };
  }
}

export async function executeWithRetry(
  entry: ToolEntry,
  params: Record<string, unknown>,
  maxRetries: number = 3
): Promise<ToolExecutionResult> {
  let lastResult: ToolExecutionResult | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    lastResult = await executeTool(entry, params);

    if (lastResult.success || !entry.definition.retryable || attempt >= maxRetries) {
      return lastResult;
    }

    const delay = Math.min(1000 * Math.pow(2, attempt), 8000);
    await new Promise((resolve) => setTimeout(resolve, delay));
  }

  return lastResult!;
}

async function logToolExecution(params: {
  agent: string;
  tool: string;
  action: string;
  params: Record<string, unknown>;
  resultStatus: 'success' | 'error' | 'rejected' | 'timeout';
  errorCode?: string;
  executionTimeMs: number;
}): Promise<void> {
  try {
    const db = await getDatabase();
    const id = uuidv4();
    const now = new Date().toISOString();

    await db.runAsync(
      `INSERT INTO audit_log (id, timestamp, agent, tool, action, params, result_status, error_code)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        now,
        params.agent,
        params.tool,
        params.action,
        JSON.stringify(params.params),
        params.resultStatus,
        params.errorCode || null,
      ]
    );
  } catch {
    // Non-critical, audit logging failure should not break tool execution
  }
}
