# AGENTS.md — Wealth Manager

> AI Agent 入口文档。所有 Agent 读取此文件了解项目结构、约定和验证流程。

---

## 项目概述

Wealth Manager 是一个 **AI 原生对话式记账系统**，基于 React Native (Expo SDK 52) + TypeScript，支持 iOS / Android / Web。

## 技术栈

- **框架**: React Native 0.76 + Expo SDK 52
- **路由**: expo-router (file-based)
- **数据库**: expo-sqlite (本地加密 SQLite)
- **图表**: ECharts 5.5 (WebView 本地沙箱，零网络依赖)
- **测试**: Jest 29 + jest-expo
- **类型**: TypeScript 5.3

## 目录结构与分层

```
src/
├── ui/                  # 表现层 (React 组件)
│   ├── chat/            # ChatScreen, InputBar, MessageBubble, QuickBar
│   ├── cards/           # 8 种聊天卡片 (Bill/Summary/Chart/Confirm/Error/Tip/...)
│   ├── charts/          # ECharts WebView 沙箱 + 配置校验
│   └── logger/          # LogScreen
├── application/         # 应用服务层 (DDD 用例编排)
│   └── BillingService   # 注入 Repository+EventBus，替代直接工具调用
├── domain/              # 领域层 (DDD 聚合根/值对象/仓储接口)
│   ├── shared/          # 共享内核 (DomainEvent, AggregateRoot, Money, DateRange)
│   ├── billing/         # 账单聚合 (Bill + 4 个领域事件)
│   ├── budget/          # 预算+储蓄 (BudgetPlan, SavingsGoal)
│   ├── asset/           # 资产+债务 (Asset, Debt)
│   ├── gamification/    # 成就+打卡 (Achievement, Streak)
│   ├── analytics/       # 只读分析上下文
│   ├── automation/      # 定时任务 (RecurringTask)
│   └── rules/           # 分类规则引擎 (ClassificationRule)
├── infrastructure/      # 基础设施层 (DDD 实现)
│   ├── events/          # DomainEventBus (基于 MessageBus)
│   └── persistence/     # SQLite Repository 实现
├── agents/              # Agent 适配层 (保留，逐步迁移)
│   ├── _shared/         # tool-registry, delegate, memory, security-profile
│   ├── master/          # MasterOrchestrator (NLU → 路由)
│   ├── ledger/          # 记账 Agent
│   ├── analyst/         # 分析 Agent
│   ├── coach/           # 教练 Agent
│   └── guardian/        # 安全 Agent
├── core/                # 基础设施核心
│   ├── database/        # SQLite (expo-sqlite)
│   ├── cache/           # MemoryCache + ToolCacheWrapper (TTL+熔断)
│   ├── message-bus/     # Pub/Sub Agent 消息总线 + 死信队列
│   ├── memory/          # 四层记忆引擎 (working/episodic/long_term/semantic)
│   ├── vector/          # 向量存储 + 余弦相似度检索
│   ├── cloud/           # LLM API, function-calling, prompts
│   ├── logger/          # Logger + Agent Introspection (延迟追踪)
│   ├── context/         # ConversationContext (窗口压缩)
│   ├── safety/          # CircuitBreaker, Guard
│   ├── persona/         # Persona Engine (人格参数)
│   ├── skills/          # Skill 注册 + 热加载
│   ├── hashchain/       # SHA-256 链式哈希
│   ├── rules/           # 规则引擎 (条件解析/自学习)
│   └── notifications/   # 本地通知服务
├── tools/               # 工具层 (80+ 函数)
├── shared/              # 全局类型 + 常量
└── __tests__/           # 测试 (24 套件, 366+ 测试)
```

## 架构决策记录 (ADR)

| 决策 | 选择 | 理由 |
|------|------|------|
| 架构模式 | DDD 六层 (UI→App→Domain→Infra→Agent→API) | 解耦 Agent 直接工具调用，改为 Repository+EventBus 注入 |
| Agent 间通信 | MessageBus (Pub/Sub + 死信) | 替代同步直调，实现松耦合 |
| 跨 Context 通信 | DomainEventBus (At-Least-Once) | 基于 MessageBus，eventType 路由 |
| 缓存 | MemoryCache (LRU 500条 30min TTL) + 熔断 | 对幂等工具自动缓存 |
| 提示词管理 | SQLite 持久化版本 + 动态模板引擎 | 替代硬编码，支持回滚 |
| 图表 | ECharts WebView 本地沙箱 | 零网络，禁止 JS 注入，JSON 校验 |
| 测试 | Jest (纯 mock，不启 Expo) | 快 (< 3s 全量) |

## 验证命令

```bash
npx tsc --noEmit          # TypeScript 编译 (必须零错误)
npx eslint . --ext .ts,.tsx --max-warnings 50  # 代码风格 (必须零错误)
npx jest                  # 全量测试 (当前 366 通过 / 24 套件)
```

## 代码约定

- **新功能**: 优先在 `domain/` 创建聚合根，在 `infrastructure/` 实现 Repository
- **旧代码**: `tools/` 和 `agents/` 逐步迁移，不一次性重写
- **命名**: 聚合根 PascalCase 单数 (`Bill`, `SavingsGoal`)，事件 `{Aggregate}{动词}Event`
- **测试**: 每个模块对应 `src/__tests__/` 下同名目录
- **不引入新 npm 依赖**: 全部使用已有 expo/react-native 生态

## CI/CD 规则

- **普通提交**：只跑 Lint & Test（typecheck + jest），不要在 commit message 里加 `[build]`
- **构建 APK**：仅在需要发版时手动在 commit message 中加 `[build]`，如 `feat: xxx [build]`
- **Claude/AI Agent**：没有构建权限，提交代码时 **禁止** 使用 `[build]`

## 相关文档

| 文档 | 路径 |
|------|------|
| 技术架构标准 V2.0 | `标准/01-技术架构标准.md` |
| DDD 重构蓝图 | `docs/CurrentTask/spec-ddd.md` |
| 数据模型标准 | `标准/03-数据模型标准.md` |
| 安全标准 | `标准/04-安全标准.md` |
| 测试与性能标准 | `标准/05-测试与性能标准.md` |
| UI 设计标准 | `标准/06-UI设计标准.md` |
