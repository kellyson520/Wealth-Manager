import {
  AgentId,
  ToolDefinition,
} from '../../shared/types';

export interface ToolEntry {
  definition: ToolDefinition;
  handler: (...args: any[]) => Promise<any>;
  allowedAgents: AgentId[];
}

const toolRegistry = new Map<string, ToolEntry>();

export function registerTool(entry: ToolEntry): void {
  toolRegistry.set(entry.definition.name, entry);
}

export function getTool(name: string): ToolEntry | undefined {
  return toolRegistry.get(name);
}

export function listToolsForAgent(agentId: AgentId): ToolEntry[] {
  const result: ToolEntry[] = [];
  for (const [, entry] of toolRegistry) {
    if (entry.allowedAgents.includes(agentId)) {
      result.push(entry);
    }
  }
  return result;
}

export function isToolAllowedForAgent(
  toolName: string,
  agentId: AgentId
): boolean {
  const entry = toolRegistry.get(toolName);
  return entry ? entry.allowedAgents.includes(agentId) : false;
}

export function getAllTools(): Map<string, ToolEntry> {
  return toolRegistry;
}

export function getToolNamesForAgent(agentId: AgentId): string[] {
  return listToolsForAgent(agentId).map((e) => e.definition.name);
}

export function describeToolsForAgent(agentId: AgentId): string {
  const tools = listToolsForAgent(agentId);
  if (tools.length === 0) return '（无直接工具）';

  const lines: string[] = [];
  for (const t of tools) {
    const d = t.definition;
    const params = d.parameters
      .map((p) => `${p.name}: ${p.type}${p.required ? '' : '?'}`)
      .join(', ');
    lines.push(
      `  ${d.name}(${params}) → ${d.returns.type} | 权限L${d.permissionLevel} | ${d.description}`
    );
  }
  return lines.join('\n');
}

export function generateAgentToolPrompt(
  agentId: AgentId,
  agentName: string
): string {
  const tools = listToolsForAgent(agentId);
  if (tools.length === 0) {
    return `${agentName} 不直接调用工具，仅通过意图路由将任务委派给子 Agent。`;
  }

  const byNamespace: Record<string, ToolEntry[]> = {};
  for (const t of tools) {
    const ns = extractNamespace(t.definition.name);
    if (!byNamespace[ns]) byNamespace[ns] = [];
    byNamespace[ns].push(t);
  }

  let prompt = `${agentName} 可调用以下原生工具：\n\n`;
  for (const [ns, entries] of Object.entries(byNamespace)) {
    prompt += `### ${ns} 类工具\n`;
    for (const e of entries) {
      const d = e.definition;
      const params = d.parameters
        .map((p) => `  ${p.name}(${p.type}${p.required ? '必填' : '可选'}): ${p.description}`)
        .join('\n');
      prompt += `**${d.name}** | 权限 L${d.permissionLevel}${d.idempotent ? ' | 幂等' : ''}${d.retryable ? ' | 可重试' : ''}\n`;
      prompt += `描述: ${d.description}\n`;
      prompt += `参数:\n${params}\n`;
      prompt += `返回: ${d.returns.type} - ${d.returns.description}\n`;
      prompt += `超时: ${d.timeout}ms\n\n`;
    }
  }
  prompt += `---\n`;
  prompt += `权限说明: L0=只读安全, L1=数据写入, L2=敏感操作(需用户确认)\n`;
  prompt += `安全约束: 调用前检查权限，L2 工具必须经 Guardian 预检\n`;
  return prompt;
}

function extractNamespace(toolName: string): string {
  if (toolName.startsWith('add_') || toolName.startsWith('search_')) {
    if (toolName.includes('debt') || toolName.includes('asset') || toolName.includes('tag') || toolName.includes('reimbursement')) return 'other';
    return 'bills';
  }
  if (
    toolName.startsWith('get_') &&
    !toolName.includes('savings') &&
    !toolName.includes('streak') &&
    !toolName.includes('achievement') &&
    !toolName.includes('recurring') &&
    !toolName.includes('notification') &&
    !toolName.includes('reminder') &&
    !toolName.includes('debt') &&
    !toolName.includes('asset') &&
    !toolName.includes('sync') &&
    !toolName.includes('import') &&
    !toolName.includes('privacy') &&
    !toolName.includes('shortcuts')
  )
    return 'stats';
  if (
    toolName.startsWith('set_') ||
    toolName.startsWith('create_') ||
    toolName.startsWith('get_savings')
  )
    return 'budget';
  if (toolName.includes('streak') || toolName.includes('achievement'))
    return 'gamification';
  if (
    toolName.startsWith('run_') ||
    toolName.startsWith('analyze_') ||
    toolName.startsWith('sanitize_') ||
    toolName.startsWith('verify_') ||
    toolName.startsWith('repair_') ||
    toolName.startsWith('export_') ||
    toolName.startsWith('get_privacy') ||
    toolName.startsWith('revoke_')
  )
    return 'security';
  if (
    toolName.startsWith('create_recurring') ||
    toolName.startsWith('get_recurring') ||
    toolName.startsWith('delete_recurring') ||
    toolName.startsWith('register_shortcut') ||
    toolName.startsWith('schedule_local') ||
    toolName.startsWith('get_notification') ||
    toolName.startsWith('schedule_') ||
    toolName.startsWith('cancel_') ||
    toolName.startsWith('get_shortcut') ||
    toolName.startsWith('evaluate_') ||
    toolName.includes('scenario') ||
    toolName.includes('proactive') ||
    toolName.includes('today_summary')
  )
    return 'automation';
  if (toolName.startsWith('rules_')) return 'rules';
  if (toolName.includes('_asset') || toolName.startsWith('list_assets'))
    return 'assets';
  if (toolName.includes('_tag') || toolName.includes('_tags') || toolName.startsWith('list_tags') || toolName.startsWith('add_tag'))
    return 'tags';
  if (toolName.includes('_debt') || toolName.includes('_debts') || toolName.includes('repayment'))
    return 'debt';
  if (toolName.startsWith('import_') || toolName.includes('import_'))
    return 'import';
  if (toolName.startsWith('export_') || toolName.includes('backup'))
    return 'data';
  if (toolName.includes('reimbursement'))
    return 'reimbursement';
  if (toolName.includes('webdav') || toolName.includes('sync_'))
    return 'sync';
  return 'other';
}
