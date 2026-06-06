import type { AgentId, PermissionLevel } from '../../shared/types';

const MASTER_AI_CONTROL_TOOLS = new Set([
  'delete_ai_memory',
  'update_ai_persona',
  'remember_user_preference',
  'set_ai_learning_enabled',
]);

export function hasScopedToolPermission(
  agentId: AgentId,
  toolName: string,
  permissionLevel: PermissionLevel
): boolean {
  return agentId === 'master'
    && permissionLevel === 1
    && MASTER_AI_CONTROL_TOOLS.has(toolName);
}
