import { v4 as uuidv4 } from 'uuid';
import { logger } from './logger';
import type { LogLevel, AgentId } from '../../shared/types';

export interface ToolLatencyRecord {
  toolName: string;
  args: Record<string, unknown>;
  durationMs: number;
  success: boolean;
  errorCode?: string;
  agentId: AgentId;
  timestamp: string;
}

export interface DecisionTrace {
  traceId: string;
  agentId: AgentId;
  steps: DecisionStep[];
  startedAt: string;
  completedAt?: string;
  outcome: 'success' | 'error' | 'timeout' | 'in_progress';
}

export interface DecisionStep {
  step: string;
  timestamp: string;
  detail?: string;
  durationMs?: number;
}

const toolLatencies: ToolLatencyRecord[] = [];
const decisionTraces = new Map<string, DecisionTrace>();
const agentLogLevels = new Map<AgentId, LogLevel>();
const SLOW_THRESHOLD_RATIO = 0.8;

const MAX_LATENCY_BUFFER = 200;
const MAX_TRACE_BUFFER = 50;

export function trackToolLatency(record: ToolLatencyRecord): void {
  toolLatencies.push(record);
  if (toolLatencies.length > MAX_LATENCY_BUFFER) {
    toolLatencies.splice(0, toolLatencies.length - MAX_LATENCY_BUFFER);
  }
}

export function getToolLatencyStats(params?: {
  toolName?: string;
  agentId?: AgentId;
}): {
  records: ToolLatencyRecord[];
  avgDurationMs: number;
  successRate: number;
  totalCalls: number;
} {
  let filtered = toolLatencies;
  if (params?.toolName) {
    filtered = filtered.filter((r) => r.toolName === params.toolName);
  }
  if (params?.agentId) {
    filtered = filtered.filter((r) => r.agentId === params.agentId);
  }

  const totalCalls = filtered.length;
  if (totalCalls === 0) {
    return { records: [], avgDurationMs: 0, successRate: 100, totalCalls: 0 };
  }

  const totalDuration = filtered.reduce((sum, r) => sum + r.durationMs, 0);
  const successCount = filtered.filter((r) => r.success).length;

  return {
    records: filtered,
    avgDurationMs: Math.round(totalDuration / totalCalls),
    successRate: Math.round((successCount / totalCalls) * 10000) / 100,
    totalCalls,
  };
}

export function startDecisionTrace(agentId: AgentId): string {
  const traceId = uuidv4();

  if (decisionTraces.size >= MAX_TRACE_BUFFER) {
    const firstKey = decisionTraces.keys().next().value;
    if (firstKey) decisionTraces.delete(firstKey);
  }

  decisionTraces.set(traceId, {
    traceId,
    agentId,
    steps: [],
    startedAt: new Date().toISOString(),
    outcome: 'in_progress',
  });

  return traceId;
}

export function addDecisionStep(
  traceId: string,
  step: string,
  detail?: string,
  durationMs?: number
): void {
  const trace = decisionTraces.get(traceId);
  if (!trace) return;

  trace.steps.push({
    step,
    timestamp: new Date().toISOString(),
    detail,
    durationMs,
  });
}

export function completeDecisionTrace(
  traceId: string,
  outcome: DecisionTrace['outcome']
): void {
  const trace = decisionTraces.get(traceId);
  if (!trace) return;

  trace.completedAt = new Date().toISOString();
  trace.outcome = outcome;
}

export function getDecisionTrace(traceId: string): DecisionTrace | undefined {
  return decisionTraces.get(traceId);
}

export function listDecisionTraces(params?: {
  agentId?: AgentId;
  limit?: number;
}): DecisionTrace[] {
  const traces = Array.from(decisionTraces.values());
  let filtered = traces;
  if (params?.agentId) {
    filtered = filtered.filter((t) => t.agentId === params.agentId);
  }
  const limit = Math.min(params?.limit || 20, 50);
  return filtered.slice(-limit);
}

export function setAgentLogLevel(agentId: AgentId, level: LogLevel): void {
  agentLogLevels.set(agentId, level);
  logger.info(
    'AgentIntrospection',
    `Log level for ${agentId} set to ${level}`
  );
}

export function getAgentLogLevel(agentId: AgentId): LogLevel {
  return agentLogLevels.get(agentId) || 'info';
}

export function enableDebugMode(agentId: AgentId): void {
  setAgentLogLevel(agentId, 'debug');
}

export function disableDebugMode(agentId: AgentId): void {
  setAgentLogLevel(agentId, 'info');
}

export function resetIntrospection(): void {
  toolLatencies.length = 0;
  decisionTraces.clear();
  agentLogLevels.clear();
}

export async function wrapToolWithLatencyTracking<T>(
  toolName: string,
  agentId: AgentId,
  args: Record<string, unknown>,
  handler: () => Promise<T>
): Promise<T> {
  const startTime = Date.now();

  try {
    const result = await handler();
    const durationMs = Date.now() - startTime;

    trackToolLatency({
      toolName,
      args,
      durationMs,
      success: true,
      agentId,
      timestamp: new Date().toISOString(),
    });

    return result;
  } catch (e) {
    const durationMs = Date.now() - startTime;

    trackToolLatency({
      toolName,
      args,
      durationMs,
      success: false,
      errorCode: e instanceof Error ? e.message : 'UNKNOWN',
      agentId,
      timestamp: new Date().toISOString(),
    });

    throw e;
  }
}

export function checkSlowThreshold(
  toolName: string,
  durationMs: number,
  expectedTimeoutMs: number
): void {
  const threshold = expectedTimeoutMs * SLOW_THRESHOLD_RATIO;
  if (durationMs > threshold) {
    logger.warn(
      'AgentIntrospection',
      `Slow tool call: ${toolName} took ${durationMs}ms (threshold: ${threshold}ms)`,
      undefined,
      { toolName, durationMs, threshold }
    );
  }
}
