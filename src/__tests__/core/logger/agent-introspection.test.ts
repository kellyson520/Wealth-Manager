import {
  trackToolLatency,
  getToolLatencyStats,
  startDecisionTrace,
  addDecisionStep,
  completeDecisionTrace,
  getDecisionTrace,
  listDecisionTraces,
  setAgentLogLevel,
  getAgentLogLevel,
  enableDebugMode,
  disableDebugMode,
  wrapToolWithLatencyTracking,
  checkSlowThreshold,
  resetIntrospection,
} from '../../../core/logger/agent-introspection';
import type { AgentId } from '../../../shared/types';

describe('AgentIntrospection - Tool Latency', () => {
  beforeEach(() => {
    resetIntrospection();
  });

  it('should track tool latency', () => {
    trackToolLatency({
      toolName: 'add_bill',
      args: { amount: 100 },
      durationMs: 45,
      success: true,
      agentId: 'ledger' as AgentId,
      timestamp: new Date().toISOString(),
    });

    const stats = getToolLatencyStats();
    expect(stats.totalCalls).toBe(1);
    expect(stats.successRate).toBe(100);
    expect(stats.avgDurationMs).toBe(45);
  });

  it('should filter stats by tool name', () => {
    trackToolLatency({
      toolName: 'add_bill', args: {}, durationMs: 10, success: true,
      agentId: 'ledger' as AgentId, timestamp: new Date().toISOString(),
    });
    trackToolLatency({
      toolName: 'search_bills', args: {}, durationMs: 20, success: true,
      agentId: 'ledger' as AgentId, timestamp: new Date().toISOString(),
    });

    const stats = getToolLatencyStats({ toolName: 'add_bill' });
    expect(stats.totalCalls).toBe(1);
  });

  it('should filter stats by agent', () => {
    trackToolLatency({
      toolName: 'get_aggregation', args: {}, durationMs: 30, success: true,
      agentId: 'analyst' as AgentId, timestamp: new Date().toISOString(),
    });
    trackToolLatency({
      toolName: 'get_aggregation', args: {}, durationMs: 35, success: false,
      agentId: 'ledger' as AgentId, timestamp: new Date().toISOString(),
    });

    const stats = getToolLatencyStats({ agentId: 'analyst' as AgentId });
    expect(stats.totalCalls).toBe(1);
  });

  it('should calculate failure rate', () => {
    trackToolLatency({
      toolName: 'test', args: {}, durationMs: 10, success: false,
      agentId: 'master' as AgentId, timestamp: new Date().toISOString(),
    });
    trackToolLatency({
      toolName: 'test', args: {}, durationMs: 10, success: true,
      agentId: 'master' as AgentId, timestamp: new Date().toISOString(),
    });

    const stats = getToolLatencyStats();
    expect(stats.successRate).toBe(50);
  });

  it('wrapToolWithLatencyTracking should track success', async () => {
    const result = await wrapToolWithLatencyTracking(
      'add_bill',
      'ledger' as AgentId,
      { amount: 100 },
      async () => 'success'
    );

    expect(result).toBe('success');
    const stats = getToolLatencyStats();
    expect(stats.totalCalls).toBe(1);
  });

  it('wrapToolWithLatencyTracking should track failure', async () => {
    await expect(
      wrapToolWithLatencyTracking(
        'bad_tool',
        'ledger' as AgentId,
        {},
        async () => { throw new Error('test error'); }
      )
    ).rejects.toThrow('test error');

    const stats = getToolLatencyStats();
    expect(stats.totalCalls).toBe(1);
    expect(stats.successRate).toBe(0);
  });
});

describe('AgentIntrospection - Decision Trace', () => {
  beforeEach(() => {
    resetIntrospection();
  });

  it('should start and complete a decision trace', () => {
    const traceId = startDecisionTrace('master' as AgentId);

    addDecisionStep(traceId, 'NLU classification', 'intent=add_bill');
    addDecisionStep(traceId, 'Route to Ledger', undefined, 12);
    addDecisionStep(traceId, 'Tool execution', 'add_bill completed', 45);
    completeDecisionTrace(traceId, 'success');

    const trace = getDecisionTrace(traceId);
    expect(trace).toBeDefined();
    expect(trace!.steps).toHaveLength(3);
    expect(trace!.outcome).toBe('success');
    expect(trace!.steps[0].step).toBe('NLU classification');
  });

  it('should list decision traces by agent', () => {
    const id1 = startDecisionTrace('master' as AgentId);
    completeDecisionTrace(id1, 'success');

    const id2 = startDecisionTrace('ledger' as AgentId);
    completeDecisionTrace(id2, 'error');

    const traces = listDecisionTraces({ agentId: 'master' as AgentId });
    expect(traces.length).toBe(1);
    expect(traces[0].agentId).toBe('master');
  });

  it('should return undefined for unknown trace', () => {
    const trace = getDecisionTrace('non-existent');
    expect(trace).toBeUndefined();
  });
});

describe('AgentIntrospection - Log Levels', () => {
  it('should set and get log levels', () => {
    setAgentLogLevel('master' as AgentId, 'debug');
    expect(getAgentLogLevel('master' as AgentId)).toBe('debug');

    setAgentLogLevel('master' as AgentId, 'warn');
    expect(getAgentLogLevel('master' as AgentId)).toBe('warn');
  });

  it('should default to info level', () => {
    expect(getAgentLogLevel('unknown_agent' as AgentId)).toBe('info');
  });

  it('enableDebugMode should set to debug', () => {
    enableDebugMode('guardian' as AgentId);
    expect(getAgentLogLevel('guardian' as AgentId)).toBe('debug');
    disableDebugMode('guardian' as AgentId);
    expect(getAgentLogLevel('guardian' as AgentId)).toBe('info');
  });
});

describe('AgentIntrospection - Slow Threshold', () => {
  it('should not warn for fast calls', () => {
    expect(() => checkSlowThreshold('test', 50, 5000)).not.toThrow();
  });
});
