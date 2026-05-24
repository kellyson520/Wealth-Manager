# 更新日志

## [V4.0] — 2026-05-24

### 新增 — 五大 Agent 能力体系完善

#### 共享基础设施 (`src/agents/_shared/`)
- **工具注册中心** (`tool-registry.ts`): 集中管理全部 30 个原生工具，支持按 Agent 过滤权限、工具签名查询、可用性校验
- **安全档案** (`security-profile.ts`): 为五大 Agent 各定义安全禁令、操作规则、权限级别 (L0/L1/L2)、检查清单
- **记忆系统** (`memory.ts`): 封装 `memories` 表 CRUD，支持长期记忆 (`long_term`) 与情景记忆 (`episodic`)，提供 `saveMemory` / `recallMemory` / `forgetMemory` / `rememberThis` / `rememberMoment`
- **任务委派** (`delegate.ts`): 基于 `AgentMessage` 协议的跨 Agent 通信，定义委派白名单 (`getDelegationTargets`)、权限校验 (`canDelegate`) 、消息创建 (`createAgentMessage`)
- **工具初始化** (`init-tools.ts`): 一次性注册全部 30 个工具，绑定 handler、权限等级与 Agent 白名单

#### Agent 能力清单 (各 Agent 目录新增 CAPABILITIES.md)

| Agent | 可用工具 | 安全关键约束 | 委派目标 |
|-------|---------|-------------|---------|
| **Master** | (路由感知) 0 个直接工具 | 禁直连数据库，禁跳 Guardian 清洗 | Ledger / Analyst / Coach / Guardian |
| **Ledger** | bills(2) + stats(1) | 禁安全扫描，写前预检 | Guardian / Analyst |
| **Analyst** | stats(8) | 只读，禁写账单 | Ledger / Coach |
| **Coach** | budget(3) + gamification(3) + stats(1) | 禁查原始数据，禁投资建议 | Analyst / Guardian |
| **Guardian** | security(9) + automation(6) | 禁上云，L2 需确认 | (不可委派) |

#### Agent 系统提示词 (各 Agent 目录新增 PROMPT.md)
- 每个 Agent 含：身份定义、工具签名文档、安全铁律、记忆操作指南、委派流程、回复格式规范

#### 代码集成
- **Master** (`master.agent.ts`): 增加工具注册表懒初始化、记忆召回 (最近 3 条)、episodic 自动记忆写入
- **Ledger** (`ledger.agent.ts`): `handleAddExpense` / `handleAddIncome` 增加 `canCallTool()` 权限校验、`Guardian.preActionCheck()` 安全预检、商户分类长期记忆
- **Analyst** (`analyst.agent.ts`): `handleGetSummary` 增加工具校验 + 分析记忆
- **Coach** (`coach.agent.ts`): `handleSetBudget` / `handleGreeting` 增加工具校验 + 预算偏好记忆
- **Guardian** (`guardian.agent.ts`): `handleSafetyCheck` / `handlePrivacyReport` / `preActionCheck` 增加工具校验 + 安全事件记忆 + 预检审计记录

### 变更统计
- **新增文件**: 30 个（共享模块 7、能力清单 5、系统提示词 5、工具模块 4、test 8、agent TS 3）
- **修改文件**: 7 个（5 个 agent TS + nlu.ts + database.ts + types.ts + stats.tool.ts + ChatScreen.tsx）
- **总计**: +5882 / -33 行
