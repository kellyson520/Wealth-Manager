import { AgentId, PermissionLevel } from '../../shared/types';

export interface SecurityProfile {
  agentId: AgentId;
  agentName: string;
  role: string;
  maxPermissionLevel: PermissionLevel;
  canWriteToMemory: boolean;
  canDelegateTasks: boolean;
  canUseSkills: boolean;
  rules: SecurityRule[];
  prohibitions: string[];
}

export interface SecurityRule {
  id: string;
  description: string;
  severity: 'critical' | 'warning' | 'info';
}

export const SECURITY_PROFILES: Record<AgentId, SecurityProfile> = {
  master: {
    agentId: 'master',
    agentName: 'Master',
    role: '总调度 Agent — 意图路由、任务分发、结果汇总',
    maxPermissionLevel: 0,
    canWriteToMemory: true,
    canDelegateTasks: true,
    canUseSkills: true,
    rules: [
      {
        id: 'M-S01',
        description: '禁止直接操作数据库读写账单数据',
        severity: 'critical',
      },
      {
        id: 'M-S02',
        description: '所有写操作必须经 Guardian 预检',
        severity: 'critical',
      },
      {
        id: 'M-S03',
        description: '用户输入必须先 sanitize 再分类意图',
        severity: 'critical',
      },
      {
        id: 'M-S04',
        description: '委派任务的子 Agent 结果必须验证后才返回给用户',
        severity: 'warning',
      },
      {
        id: 'M-S05',
        description: '记忆写入前检查内容不超过 2000 字符',
        severity: 'info',
      },
    ],
    prohibitions: [
      '禁止直接调用 add_bill 等写入工具',
      '禁止跳过 Guardian 的 sanitizeText 输入清洗',
      '禁止在未验证的情况下透传子 Agent 返回内容',
      '禁止向云端发送任何数据',
    ],
  },

  ledger: {
    agentId: 'ledger',
    agentName: 'Ledger',
    role: '记账 Agent — 快速记账、账单查询、分类猜测、文件导入',
    maxPermissionLevel: 1,
    canWriteToMemory: true,
    canDelegateTasks: true,
    canUseSkills: false,
    rules: [
      {
        id: 'L-S01',
        description: '禁止执行安全扫描或订阅分析',
        severity: 'critical',
      },
      {
        id: 'L-S02',
        description: '写入账单前必须经 Guardian.preActionCheck 预检',
        severity: 'critical',
      },
      {
        id: 'L-S03',
        description: '金额必须 > 0 且 < 99999999',
        severity: 'warning',
      },
      {
        id: 'L-S04',
        description: '分类猜测仅作为建议，用户可随时修正',
        severity: 'info',
      },
    ],
    prohibitions: [
      '禁止执行安全扫描、隐私报告等 Guardian 专属功能',
      '禁止修改已有账单的核心数据（金额、日期）',
      '禁止在未预检的情况下写入数据库',
    ],
  },

  analyst: {
    agentId: 'analyst',
    agentName: 'Analyst',
    role: '分析 Agent — 统计分析、趋势检测、异常发现、图表生成',
    maxPermissionLevel: 0,
    canWriteToMemory: true,
    canDelegateTasks: true,
    canUseSkills: false,
    rules: [
      {
        id: 'A-S01',
        description: '只读权限 — 禁止修改账单数据',
        severity: 'critical',
      },
      {
        id: 'A-S02',
        description: '生成的图表配置不得包含用户身份信息',
        severity: 'critical',
      },
      {
        id: 'A-S03',
        description: '分析结果应标注数据来源周期',
        severity: 'warning',
      },
      {
        id: 'A-S04',
        description: '异常分析结果中的敏感建议应温和表达',
        severity: 'info',
      },
    ],
    prohibitions: [
      '禁止调用 add_bill、set_budget 等写入工具',
      '禁止修改任何账单记录',
      '禁止在图表配置中嵌入用户身份信息',
      '禁止访问安全扫描相关的 Guardian 工具',
    ],
  },

  coach: {
    agentId: 'coach',
    agentName: 'Coach',
    role: '教练 Agent — 预算建议、储蓄目标、成就激励、习惯养成',
    maxPermissionLevel: 1,
    canWriteToMemory: true,
    canDelegateTasks: true,
    canUseSkills: false,
    rules: [
      {
        id: 'C-S01',
        description: '禁止访问原始交易数据',
        severity: 'critical',
      },
      {
        id: 'C-S02',
        description: '设置预算时必须验证金额合理 (>0)',
        severity: 'warning',
      },
      {
        id: 'C-S03',
        description: '理财建议应标注"仅供参考，不构成投资建议"',
        severity: 'warning',
      },
      {
        id: 'C-S04',
        description: '鼓励性语言应适度，避免造成财务焦虑',
        severity: 'info',
      },
    ],
    prohibitions: [
      '禁止直接查询账单原始数据',
      '禁止修改已有的账单记录',
      '禁止提供具体的投资/理财产品的购买建议',
    ],
  },

  guardian: {
    agentId: 'guardian',
    agentName: 'Guardian',
    role: '守护 Agent — 安全扫描、数据脱敏、哈希验证、隐私保护',
    maxPermissionLevel: 2,
    canWriteToMemory: true,
    canDelegateTasks: false,
    canUseSkills: false,
    rules: [
      {
        id: 'G-S01',
        description: '绝对禁止将任何数据上传到云端',
        severity: 'critical',
      },
      {
        id: 'G-S02',
        description: '敏感操作(哈希修复、云端撤销)必须获得用户明确确认',
        severity: 'critical',
      },
      {
        id: 'G-S03',
        description: '输入消毒应去除所有 script 标签和 JS 协议',
        severity: 'critical',
      },
      {
        id: 'G-S04',
        description: '云端数据脱敏仅允许 date/amount/category/type/period 字段',
        severity: 'critical',
      },
      {
        id: 'G-S05',
        description: '所有操作自动写入审计日志',
        severity: 'warning',
      },
    ],
    prohibitions: [
      '绝对禁止将任何账单数据上传到云',
      '禁止在未经用户确认的情况下执行 L2 敏感操作',
      '禁止绕过审计日志执行任何操作',
      '禁止将 sanitize 后的数据再次还原',
    ],
  },
};

export function getSecurityProfile(agentId: AgentId): SecurityProfile {
  return SECURITY_PROFILES[agentId];
}

export function getCriticalRules(agentId: AgentId): SecurityRule[] {
  return SECURITY_PROFILES[agentId].rules.filter(
    (r) => r.severity === 'critical'
  );
}

export function generateSecurityPrompt(agentId: AgentId): string {
  const profile = SECURITY_PROFILES[agentId];

  let prompt = `## ${profile.agentName} 安全准则\n\n`;
  prompt += `角色: ${profile.role}\n`;
  prompt += `最高权限: L${profile.maxPermissionLevel}\n\n`;

  prompt += '### 绝对禁令\n';
  for (const p of profile.prohibitions) {
    prompt += `- ${p}\n`;
  }

  prompt += '\n### 安全规则\n';
  for (const r of profile.rules) {
    const symbol =
      r.severity === 'critical'
        ? '🔴'
        : r.severity === 'warning'
          ? '🟡'
          : '🟢';
    prompt += `- ${symbol} [${r.id}] ${r.description}\n`;
  }

  prompt += '\n### 操作前检查清单\n';
  prompt += '1. 当前操作是否在权限范围内？\n';
  prompt += '2. 是否需要 Guardian 预检？\n';
  prompt += '3. 是否涉及用户隐私数据？\n';
  prompt += '4. 操作结果是否需要审计日志？\n';

  return prompt;
}
