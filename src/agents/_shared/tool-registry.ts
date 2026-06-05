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
  if (toolName.startsWith('add_bill') || toolName.startsWith('search_bill') ||
      toolName.startsWith('get_bill') || toolName === 'modify_bill' ||
      toolName === 'delete_bill' || toolName === 'split_bill' ||
      toolName === 'refund_bill') return 'bills';

  if ((toolName.startsWith('get_') && !toolName.includes('savings') &&
       !toolName.includes('streak') && !toolName.includes('achievement') &&
       !toolName.includes('recurring') && !toolName.includes('notification') &&
       !toolName.includes('reminder') && !toolName.includes('debt') &&
       !toolName.includes('asset') && !toolName.includes('sync') &&
       !toolName.includes('import') && !toolName.includes('privacy') &&
       !toolName.includes('shortcut') && !toolName.includes('level') &&
       !toolName.includes('challenge') && !toolName.includes('bill')) ||
      toolName === 'generate_chart_config') return 'stats';

  if (toolName.startsWith('set_budget') || toolName.startsWith('create_savings') ||
      toolName.startsWith('get_savings') || toolName.startsWith('update_savings') ||
      toolName === 'create_recurring_task' || toolName === 'check_budget_overrun')
    return 'budget';

  if (toolName.includes('streak') || toolName.includes('achievement') ||
      toolName.includes('level') || toolName.includes('challenge'))
    return 'gamification';

  if (toolName.startsWith('run_safety') || toolName.startsWith('analyze_sub') ||
      toolName.startsWith('sanitize_') || toolName.startsWith('verify_') ||
      toolName.startsWith('repair_') || toolName.startsWith('get_privacy') ||
      toolName.startsWith('revoke_') || toolName === 'export_audit_package')
    return 'security';

  if (toolName.startsWith('create_recurring') || toolName.startsWith('get_recurring') ||
      toolName.startsWith('delete_recurring') || toolName.startsWith('register_shortcut') ||
      toolName.startsWith('get_shortcut') || toolName.startsWith('schedule_') ||
      toolName.startsWith('cancel_') || toolName.startsWith('get_notification') ||
      toolName.startsWith('evaluate_') || toolName.includes('scenario') ||
      toolName.includes('proactive') || toolName.includes('today_summary'))
    return 'automation';

  if (toolName.startsWith('rules_')) return 'rules';

  if (toolName.includes('_asset') || toolName === 'transfer_asset' ||
      toolName.startsWith('list_assets') || toolName.startsWith('add_asset') ||
      toolName.startsWith('get_asset') || toolName.startsWith('update_asset') ||
      toolName.startsWith('delete_asset')) return 'assets';

  if (toolName.includes('_tag') || toolName.includes('_tags') ||
      toolName.startsWith('list_tags') || toolName.startsWith('add_tag') ||
      toolName.startsWith('tag_bill') || toolName.startsWith('untag_bill'))
    return 'tags';

  if (toolName.includes('_debt') || toolName.includes('_debts') ||
      toolName.includes('repayment') || toolName.includes('credit_card'))
    return 'debt';

  if (toolName.startsWith('import_') || toolName.startsWith('get_import') ||
      toolName === 'ocr_import') return 'import';

  if (toolName.startsWith('export_') || toolName.includes('backup'))
    return 'data';

  if (toolName.includes('reimbursement') || toolName === 'settle_reimbursement')
    return 'reimbursement';

  if (toolName.includes('webdav') || toolName.includes('sync_') ||
      toolName === 'list_sync_files' || toolName === 'get_sync_status')
    return 'sync';

  if (toolName.includes('_link') || toolName.includes('_shared') ||
      toolName === 'create_link' || toolName === 'leave_shared' ||
      toolName === 'delete_link') return 'sharing';

  if (toolName.includes('_memory') || toolName.includes('_memories') ||
      toolName.includes('_persona') || toolName.includes('_learning') ||
      toolName === 'remember_user_preference')
    return 'memory';

  return 'other';
}
