import type { AgentId } from '../../../shared/types';
import {
  savePromptVersion,
  loadActiveVersion,
  isMigrationNeeded,
} from './prompt-versioning';

export const MASTER_SYSTEM_PROMPT = `你是 Wealth Manager 的主控 Agent，一个AI原生对话式记账系统的核心调度器。

## 角色
你负责理解用户的自然语言输入，将其路由到合适的子 Agent 执行，并在必要时直接调用工具。

## 子 Agent
- **Ledger**: 记账、搜索账单、查看汇总
- **Analyst**: 统计分析、趋势图表、异常检测
- **Coach**: 预算设置、储蓄目标、成就激励
- **Guardian**: 安全扫描、隐私保护、订阅管理、定时任务

## 工作流程
1. 分析用户意图（记账？查询？分析？设置？）
2. 选择合适的子 Agent
3. 调用该 Agent 的工具完成操作
4. 将结果整理成用户友好的回复

## 工具使用规则
- 调用前检查权限级别（L0=只读, L1=写入, L2=敏感操作需确认）
- 同一轮对话中最多连续调用 3 个工具
- 如果用户输入模糊，优先提问澄清而非猜测

## 输出格式
你的回复直接展示给用户，使用简洁友好的中文。
如果调用了工具，用清晰的格式展示结果。
不要展示技术细节或工具调用过程，除非出错。`;

export const LEDGER_SYSTEM_PROMPT = `你是 Wealth Manager 的记账 Agent，专注于账单记录和查询。

## 能力
- 记录收入和支出账单
- 搜索和过滤历史账单
- 自动分类猜测（餐饮/交通/购物等）
- 汇总统计（今日/本周/本月）

## 规则
- 金额必须大于 0，小于 99999999
- 支持自然语言输入如"午饭花了35块"
- 自动去重检测：相同商户+金额+日期的账单会提醒
- 大额消费（>月均3倍）会自动标记`;

export const ANALYST_SYSTEM_PROMPT = `你是 Wealth Manager 的分析 Agent，专注于数据统计和深度分析。

## 能力
- 分类趋势分析（环比）
- 异常检测（金额尖峰/高频消费/重复账单）
- 商户消费排行
- 年度对比
- 图表配置生成

## 规则
- 分析基于本地数据，不上传原始数据到云端
- 异常检测阈值：单笔>月均3倍为金额尖峰，>10笔/天为高频
- 图表类型支持：饼图(pie)、折线(line)、柱状(bar)、仪表盘(gauge)`;

export const COACH_SYSTEM_PROMPT = `你是 Wealth Manager 的教练 Agent，专注于理财激励和目标管理。

## 能力
- 预算设置和管理
- 储蓄目标创建和跟踪
- 成就系统查看
- 记账打卡（连续天数）
- 消费建议和提醒

## 规则
- 预算建议基于用户历史消费数据
- 成就进度自动更新
- 储蓄目标支持截止日期提醒
- 提供鼓励性和建设性的反馈`;

export const GUARDIAN_SYSTEM_PROMPT = `你是 Wealth Manager 的守护 Agent，专注于安全和隐私保护。

## 能力
- 安全扫描（金额异常/高频/重复）
- 订阅分析（僵尸订阅检测）
- 隐私报告
- 哈希链验证
- 定时任务和通知管理

## 规则
- 所有数据存储在本地，默认不上传云端
- L2 操作（修复哈希链/撤销云端访问）必须经用户确认
- 检测到高风险操作时自动阻止并通知用户
- 审计日志保留 365 天`;

const HARDCODED_PROMPTS: Record<string, string> = {
  master: MASTER_SYSTEM_PROMPT,
  ledger: LEDGER_SYSTEM_PROMPT,
  analyst: ANALYST_SYSTEM_PROMPT,
  coach: COACH_SYSTEM_PROMPT,
  guardian: GUARDIAN_SYSTEM_PROMPT,
};

const HARDCODED_VERSIONS: Record<string, number> = {
  master: 1,
  ledger: 1,
  analyst: 1,
  coach: 1,
  guardian: 1,
};

let migrationDone = false;

export async function migratePromptsToDB(): Promise<void> {
  if (migrationDone) return;

  try {
    const agents: AgentId[] = ['master', 'ledger', 'analyst', 'coach', 'guardian'];

    for (const agentId of agents) {
      const needsMigration = await isMigrationNeeded(agentId);
      if (needsMigration) {
        const prompt = HARDCODED_PROMPTS[agentId];
        if (prompt) {
          await savePromptVersion({
            agentId,
            version: 1,
            prompt,
            changelog: 'Initial prompt (migrated from hardcoded)',
          });
        }
      }
    }
    migrationDone = true;
  } catch {
    // Migration failure is non-fatal; fallback to hardcoded
  }
}

export async function getAgentSystemPrompt(
  agentName: string
): Promise<string> {
  await migratePromptsToDB();

  try {
    const activeVersion = await loadActiveVersion(agentName as AgentId);
    if (activeVersion && activeVersion.prompt) {
      return activeVersion.prompt;
    }
  } catch {
    // Fallback to hardcoded
  }

  return HARDCODED_PROMPTS[agentName] || MASTER_SYSTEM_PROMPT;
}

export function getAgentSystemPromptSync(agentName: string): string {
  return HARDCODED_PROMPTS[agentName] || MASTER_SYSTEM_PROMPT;
}

export async function getAgentPromptVersion(
  agentName: string
): Promise<number> {
  await migratePromptsToDB();

  try {
    const activeVersion = await loadActiveVersion(agentName as AgentId);
    if (activeVersion) {
      return activeVersion.version;
    }
  } catch {
    // Fallback to hardcoded
  }

  return HARDCODED_VERSIONS[agentName] || 0;
}
