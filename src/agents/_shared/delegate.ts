import { v4 as uuidv4 } from 'uuid';
import {
  AgentId,
  AgentMessage,
  IntentResult,
  ToolResult,
} from '../../shared/types';
import { getSecurityProfile, SecurityProfile } from './security-profile';
import { isToolAllowedForAgent } from './tool-registry';

export interface DelegationRequest {
  targetAgent: AgentId;
  type: string;
  payload: Record<string, unknown>;
  priority?: 'normal' | 'high' | 'critical';
}

export interface DelegationResult {
  message: AgentMessage;
  success: boolean;
  error?: string;
}

export function createAgentMessage(params: {
  source: AgentId;
  target: AgentId | 'broadcast';
  type: string;
  payload: Record<string, unknown>;
  priority?: 'normal' | 'high' | 'critical';
  replyTo?: string;
}): AgentMessage {
  return {
    messageId: uuidv4(),
    timestamp: new Date().toISOString(),
    source: params.source,
    target: params.target,
    replyTo: params.replyTo,
    type: params.type,
    payload: params.payload,
    priority: params.priority || 'normal',
    traceId: uuidv4(),
  };
}

export function canDelegate(
  sourceAgentId: AgentId,
  targetAgentId: AgentId
): boolean {
  const sourceProfile = getSecurityProfile(sourceAgentId);
  if (!sourceProfile.canDelegateTasks) return false;

  if (sourceAgentId === 'master') return true;

  if (sourceAgentId === 'guardian') return false;

  return targetAgentId !== 'master';
}

export function canCallTool(
  agentId: AgentId,
  toolName: string
): {
  allowed: boolean;
  reason?: string;
} {
  if (!isToolAllowedForAgent(toolName, agentId)) {
    return {
      allowed: false,
      reason: `${agentId} 无权调用工具 ${toolName}`,
    };
  }
  return { allowed: true };
}

export function getDelegationTargets(
  agentId: AgentId
): AgentId[] {
  const profile = getSecurityProfile(agentId);
  if (!profile.canDelegateTasks) return [];

  switch (agentId) {
    case 'master':
      return ['ledger', 'analyst', 'coach', 'guardian'];
    case 'ledger':
      return ['analyst', 'guardian'];
    case 'analyst':
      return ['ledger', 'coach'];
    case 'coach':
      return ['analyst', 'guardian'];
    case 'guardian':
      return [];
    default:
      return [];
  }
}

export function describeDelegationRules(agentId: AgentId): string {
  const profile = getSecurityProfile(agentId);
  if (!profile.canDelegateTasks) {
    return `${profile.agentName} 无任务委派权限。`;
  }

  const targets = getDelegationTargets(agentId);
  const targetNames: Record<string, string> = {
    ledger: 'Ledger(记账)',
    analyst: 'Analyst(分析)',
    coach: 'Coach(教练)',
    guardian: 'Guardian(安全)',
  };

  let rules = `### ${profile.agentName} 可委派的目标 Agent\n\n`;
  for (const t of targets) {
    rules += `- **${targetNames[t] || t}**: 通过 createAgentMessage 发送任务\n`;
  }

  rules += '\n委派格式:\n';
  rules += '```\n';
  rules += 'createAgentMessage({\n';
  rules += '  source: "my_agent_id",\n';
  rules += '  target: "target_agent_id",\n';
  rules += '  type: "task_type",\n';
  rules += '  payload: { ...task_params },\n';
  rules += '  priority: "normal" | "high" | "critical"\n';
  rules += '})\n';
  rules += '```\n';

  return rules;
}
