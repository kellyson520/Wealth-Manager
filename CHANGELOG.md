# 更新日志

本文档遵循 [语义化版本](https://semver.org/lang/zh-CN/) 规范。

---

## [0.2.0] — 2026-05-24

### 新增

#### 共享基础设施 (`src/agents/_shared/`)
- 工具注册中心 (`tool-registry.ts`): 集中管理全部 30 个原生工具，支持按 Agent 过滤、权限校验、签名查询
- 安全档案 (`security-profile.ts`): 五大 Agent 各定义安全禁令、操作规则、权限级别 (L0/L1/L2)、检查清单
- 记忆系统 (`memory.ts`): 封装 `memories` 表 CRUD，支持 `long_term` 与 `episodic` 两种记忆类型
- 任务委派 (`delegate.ts`): 基于 `AgentMessage` 协议的跨 Agent 通信，含委派白名单与权限校验
- 工具初始化 (`init-tools.ts`): 一次性注册全部 30 个工具，绑定 handler、权限与 Agent 白名单

#### Agent 能力清单 (CAPABILITIES.md × 5)
每个 Agent 新增能力清单文档：可用工具列表、安全约束、记忆能力、委派规则

| Agent | 直接工具数 | 核心安全约束 | 可委派至 |
|-------|----------|-------------|---------|
| Master | 0（纯路由） | 禁直连数据库 | Ledger / Analyst / Coach / Guardian |
| Ledger | 3 | 禁安全扫描，写前预检 | Guardian / Analyst |
| Analyst | 8 | 只读，禁修改账单 | Ledger / Coach |
| Coach | 7 | 禁查原始数据 | Analyst / Guardian |
| Guardian | 15 | 绝不上云，L2 需确认 | — |

#### Agent 系统提示词 (PROMPT.md × 5)
每个 Agent 新增 LLM 提示词：身份定义、工具签名、安全铁律、记忆操作、委派流程、回复格式

#### 代码集成
- **Master**: 工具注册表懒初始化、记忆召回、episodic 自动写入
- **Ledger**: `canCallTool()` 权限校验、`preActionCheck()` 安全预检、商户分类记忆
- **Analyst**: 工具校验、分析历史记忆
- **Coach**: 工具校验、预算偏好记忆
- **Guardian**: 工具校验、安全事件记忆、预检审计记录

---

## [0.1.0] — 2026-05-23

### 新增
- MVP 初始实现：对话式记账系统
- 五大 Agent 框架：Master / Ledger / Analyst / Coach / Guardian
- NLU 自然语言意图识别（26 条规则）
- 工具模块：bills / stats
- 数据库：bills / categories / audit_log / user_profile / memories 等 8 张表
- 聊天界面：ChatScreen / InputBar / MessageBubble / QuickBar
- CI/CD：GitHub Actions 自动构建 Android APK
