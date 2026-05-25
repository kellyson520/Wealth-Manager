import type { AgentId } from '../../../shared/types';

export interface PromptLayer {
  system: string;
  context: string;
  tools: string;
  constraints: string;
  examples: string;
}

export interface PromptBuildParams {
  agentId: AgentId;
  agentName: string;
  basePrompt: string;
  context?: string;
  toolList?: string;
  userProfile?: string;
  personaPrompt?: string;
  maxTokens?: number;
}

const PLACEHOLDER_PATTERN = /\{\{(\w+)\}\}/g;

export const DEFAULT_PROMPT_LAYERS: Record<string, PromptLayer> = {
  master: {
    system: '你是 Wealth Manager 的主控 Agent，一个AI原生对话式记账系统的核心调度器。{{persona}}\n\n## 角色定位\n你是用户与专业财务工具之间的智能桥梁，负责理解用户意图并高效完成任务。\n\n## 专业形象\n使用专业但友好的语气，像一位贴心的私人财务助理。',
    context: '## 对话上下文\n{{context}}\n\n## 用户画像\n{{userProfile}}',
    tools: '## 可用工具\n{{toolList}}',
    constraints: '## 约束规则\n1. 安全优先：L2级操作必须确认后执行\n2. 精确性：金额精确到分，分类准确无误\n3. 简洁性：避免冗长解释，直击要点\n4. 透明度：重大操作前告知用户\n5. 隐私性：不透露用户财务细节',
    examples: '## 示例\n用户："这个月花了多少钱？" → 调用 get_aggregation\n用户："设置预算3000" → 调用 set_budget',
  },
  ledger: {
    system: '你是 Wealth Manager 的记账 Agent。负责记录、搜索和管理用户账单。',
    context: '{{context}}',
    tools: '{{toolList}}',
    constraints: '金额 > 0，金额 < 99999999。支持自然语言输入。自动去重检测。',
    examples: '用户："午饭30" → add_bill(amount=30, type="expense")',
  },
  analyst: {
    system: '你是 Wealth Manager 的分析 Agent。负责数据统计、趋势分析和异常检测。',
    context: '{{context}}',
    tools: '{{toolList}}',
    constraints: '基于本地数据，不上传。异常阈值：>3倍月均=金额尖峰，>10笔/天=高频。',
    examples: '用户："消费趋势" → get_category_trend',
  },
  coach: {
    system: '你是 Wealth Manager 的教练 Agent。负责预算管理、储蓄目标和激励。',
    context: '{{context}}',
    tools: '{{toolList}}',
    constraints: '基于历史数据提供建议。提供鼓励性反馈。',
    examples: '用户："设置预算" → set_budget',
  },
  guardian: {
    system: '你是 Wealth Manager 的守护 Agent。负责安全扫描、隐私保护和定时任务。',
    context: '{{context}}',
    tools: '{{toolList}}',
    constraints: '本地存储优先。L2操作需用户确认。审计日志保留365天。',
    examples: '用户："安全扫描" → run_safety_check',
  },
};

export function buildPrompt(params: PromptBuildParams): string {
  const layers = DEFAULT_PROMPT_LAYERS[params.agentId] || DEFAULT_PROMPT_LAYERS.master;

  const variables: Record<string, string> = {
    persona: params.personaPrompt || '',
    context: params.context || '暂无历史对话',
    userProfile: params.userProfile || '新用户',
    toolList: params.toolList || '（无直接工具）',
  };

  const resolve = (template: string): string => {
    return template.replace(PLACEHOLDER_PATTERN, (_, key: string) => {
      return variables[key] || `{{${key}}}`;
    });
  };

  const sections: string[] = [];

  if (layers.system) {
    sections.push(resolve(layers.system));
  }

  if (layers.constraints) {
    sections.push(resolve(layers.constraints));
  }

  if (layers.context && params.context) {
    sections.push(resolve(layers.context));
  }

  if (layers.tools && params.toolList) {
    sections.push(resolve(layers.tools));
  }

  if (layers.examples) {
    sections.push(resolve(layers.examples));
  }

  const rawPrompt = sections.join('\n\n');
  const maxTokens = params.maxTokens || 4000;

  return truncateToTokenBudget(rawPrompt, maxTokens);
}

export function buildLayeredPrompt(params: PromptBuildParams): string {
  const layers = DEFAULT_PROMPT_LAYERS[params.agentId] || DEFAULT_PROMPT_LAYERS.master;

  const variables: Record<string, string> = {
    persona: params.personaPrompt || '',
    context: params.context || '暂无历史对话',
    userProfile: params.userProfile || '新用户',
    toolList: params.toolList || '（无直接工具）',
  };

  const resolve = (template: string): string => {
    return template.replace(PLACEHOLDER_PATTERN, (_, key: string) => {
      return variables[key] || `{{${key}}}`;
    });
  };

  const parts: Record<string, string> = {
    system: resolve(layers.system || ''),
    context: resolve(layers.context || ''),
    tools: resolve(layers.tools || ''),
    constraints: resolve(layers.constraints || ''),
    examples: resolve(layers.examples || ''),
  };

  const orderedSections: string[] = [];
  for (const key of ['system', 'constraints', 'context', 'tools', 'examples']) {
    if (parts[key]) {
      orderedSections.push(parts[key]);
    }
  }

  const full = orderedSections.join('\n\n');
  const maxTokens = params.maxTokens || 4000;
  return truncateToTokenBudget(full, maxTokens);
}

export function truncateToTokenBudget(text: string, maxTokens: number): string {
  const estimatedTokens = estimateTokenCount(text);
  if (estimatedTokens <= maxTokens) return text;

  const sections = text.split('\n\n');
  let result = '';
  let currentTokens = 0;

  for (const section of sections) {
    const sectionTokens = estimateTokenCount(section);
    if (currentTokens + sectionTokens > maxTokens) {
      const remaining = maxTokens - currentTokens;
      if (remaining > 20) {
        const truncated = section.slice(0, Math.floor(section.length * (remaining / sectionTokens)));
        result += truncated + '\n';
      }
      break;
    }
    result += section + '\n\n';
    currentTokens += sectionTokens;
  }

  return result.trim();
}

export function estimateTokenCount(text: string): number {
  let count = 0;
  for (const char of text) {
    if (/[\u4e00-\u9fff\u3400-\u4dbf]/.test(char)) {
      count += 2;
    } else if (/[a-zA-Z0-9]/.test(char)) {
      count += 0.3;
    } else {
      count += 0.5;
    }
  }
  return Math.ceil(count);
}
