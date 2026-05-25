# Phase 4: 架构演化与AI提示词优化 — 技术规格书

> 状态: Draft | 日期: 2026-05-25 | 版本: 1.0.0

---

## 1. 目标与核心产出

在已有成熟代码库（4层记忆引擎、SkillRegistry、工具注册中心、5-Agent NLU 路由、WebDAV 同步）基础上，通过增量式架构优化实现从"可用"到"优秀"的跨越。

### 核心可交付物

| # | 模块 | 产出 | 优先级 |
|---|------|------|--------|
| 11 | 消息总线 | 松耦合发布/订阅 Agent 通信层 | P0 |
| 12 | 内存缓存层 | TTL缓存 + 穿透熔断 + 统计面板 | P0 |
| 13 | 提示词版本管理器 | 版本升级 + 变更日志 + 回滚 | P0 |
| 14 | 动态提示词生成器 | 模板变量替换 + 上下文注入 + Token 预算 | P1 |
| 15 | 插件热加载系统 | 基于 SkillRegistry 的运行时发现/加载 | P1 |
| 16 | Agent 自省与日志增强 | 结构化审计日志 + 熔断自恢复 | P2 |

---

## 2. 已有基础设施（影响范围分析）

新模块必须基于现有代码增强，禁止重造轮子：

| 已有模块 | 路径 | 增强方向 |
|----------|------|----------|
| Memory Engine (4层) | `src/core/memory/memory-engine.ts` | 消息总线接入 + 向量召回增强 |
| Skill Registry | `src/core/skills/skill-registry.ts` | 热加载 + 版本兼容检查 |
| Tool Registry | `src/agents/_shared/tool-registry.ts` | 缓存包装 + 执行统计 |
| Agent Delegation | `src/agents/_shared/delegate.ts` | 消息总线替代直调 |
| Conversation Context | `src/core/context/conversation-context.ts` | 提示词生成器消费 |
| Agent Prompts (带版本号) | `src/core/cloud/prompts/agent-prompts.ts` | 版本管理器升级 |
| Function Calling | `src/core/cloud/function-calling.ts` | 无侵入，缓存其输出 |
| Vector Store | `src/core/vector/vector-store.ts` | 语义记忆召回增强 |
| Circuit Breaker | `src/core/safety/circuit-breaker.ts` | 缓存穿透熔断复用 |
| Notification Service | `src/core/notifications/notification.service.ts` | 无变更 |

---

## 3. 模块详细规格

### 3.1 消息总线 (`src/core/message-bus/`)

**目标**: 用发布/订阅模式替代 `delegate.ts` 中的直接函数调用，实现 Agent 间松耦合通信。

```
Agent A ──publish──➤ MessageBus ──dispatch──➤ Agent B (subscriber)
                          │
                          └───➤ Agent C (subscriber)
```

**核心类型**:
```typescript
interface BusMessage {
  id: string; from: AgentId; to: AgentId | 'broadcast';
  type: 'request' | 'response' | 'event' | 'error';
  payload: Record<string, unknown>;
  correlationId?: string; // 请求-响应关联
  createdAt: string;
}

type MessageHandler = (msg: BusMessage) => Promise<void>;
```

**关键行为**:
- 同步分发（`publish` 返回 `Promise.all(handlers)`）
- 广播 + 单播双模式
- 内置死信队列（handler 抛异常后转存）
- 与现有 `AgentMessage` 类型兼容（包装转换）

**文件清单**:
- `src/core/message-bus/index.ts`
- `src/core/message-bus/message-bus.ts`
- `src/core/message-bus/dead-letter.ts`

---

### 3.2 内存缓存层 (`src/core/cache/`)

**目标**: 为工具调用/LLM 响应/查询结果提供带 TTL 的内存缓存，减少重复计算。

**架构**:
```
Tool Call → CacheInterceptor → Cache Hit? → Return cached
                     ↓ Miss
              Execute Tool → Store in Cache → Return fresh
```

**核心类型**:
```typescript
interface CacheEntry<T> {
  key: string; value: T;
  expiresAt: number;
  hitCount: number;
  createdAt: string;
}

interface CacheStats {
  hits: number; misses: number; size: number;
  evictions: number; hitRate: number;
}
```

**降级策略**:
- 缓存未命中 → 穿透到数据源 → 存入缓存
- 连续 5 次穿透同一 key → 标记为热点 → 异步刷新
- 熔断触发（复用 `circuit-breaker.ts`）→ 返回 `undefined`

**文件清单**:
- `src/core/cache/index.ts`
- `src/core/cache/memory-cache.ts`
- `src/core/cache/cache-stats.ts`

---

### 3.3 提示词版本管理器 (`src/core/cloud/prompts/prompt-versioning.ts`)

**目标**: 升级现有 `VERSIONS: Record<string, number>` 硬编码，支持变更日志、增量升级和回滚。

**现有基础**: `agent-prompts.ts` 已定义 `VERSIONS` 映射和 `getAgentPromptVersion()`。

**增强内容**:
```typescript
interface PromptVersion {
  agentId: AgentId;
  version: number;       // 递增
  prompt: string;        // 完整系统提示词
  changelog: string;     // 变更说明
  createdAt: string;     // ISO 时间戳
  isActive: boolean;     // 当前激活版本
}

// 迁移路径: 硬编码 VERSIONS → PromptVersionManager.loadActive()
```

**文件清单**:
- `src/core/cloud/prompts/prompt-versioning.ts` (新增)
- `src/core/cloud/prompts/agent-prompts.ts` (改造：接版本管理器)

---

### 3.4 动态提示词生成器 (`src/core/cloud/prompts/prompt-builder.ts`)

**目标**: 将静态 Prompt 模板化，支持运行时注入上下文、工具列表、用户画像。

**输入来源**:
- 模板: 来自 PromptVersionManager 的激活版本
- 上下文: `ConversationContext` 窗口压缩摘要
- 工具: `ToolRegistry.listToolsForAgent(agentId)`
- 用户画像: `MemoryEngine` 的 episodic 层最近记忆
- Token 预算: 自动截断（total ≤ 4000 tokens）

**实现**: 模板字符串 `{{variable}}` 替换 + `truncateToTokenBudget()`

**文件清单**:
- `src/core/cloud/prompts/prompt-builder.ts` (新增)

---

### 3.5 插件热加载 (`src/core/skills/skill-loader.ts`)

**目标**: 基于现有 `SkillRegistry`，增加运行时发现和动态加载能力（当前 skills 在启动时注册）。

**对比**:
| 维度 | 现有 SkillRegistry | 插件热加载 |
|------|-------------------|-----------|
| 注册时机 | `initializeDefaultSkills()` 启动时 | 启动时 + 运行时扫描 |
| 发现机制 | 硬编码 default 列表 | `scanPluginDir()` + `manifest.json` |
| 依赖检查 | `verifyDependencies()` | 增强：semver 兼容检查 |
| 热更新 | 不支持 | `reloadPlugin()` 卸载后重载 |

**文件清单**:
- `src/core/skills/skill-loader.ts` (新增)
- `src/core/skills/skill-registry.ts` (增强：SemVer 依赖)

---

### 3.6 Agent 自省与日志增强 (`src/core/logger/`)

**目标**: 结构化审计日志 + 熔断自恢复能力。

**新增功能**:
- 工具调用耗时统计 (`tool-latency`)
- Agent 决策链追踪 (`decision-trace`)
- 熔断器触发事件自动记录
- 日志级别动态调整（debug ↔ info ↔ warn）

---

## 4. 依赖关系图

```
MessageBus ─── 被 Agent 和 Cache 依赖
    ↓
CacheLayer ─── 包装 ToolRegistry 调用
    ↓
PromptBuilder ─── 消费 ConversationContext + AgentPrompts + Memory
    ↓
PromptVersioning ─── 升级 agent-prompts.ts
    ↓
SkillLoader ─── 增强 skill-registry.ts
```

---

## 5. 完成定义 (Definition of Done)

每个任务必须通过以下验收标准：

1. **TypeScript 编译零错误**: `npx tsc --noEmit` 返回 exit 0
2. **ESLint 零警告**: `npx eslint . --ext .ts,.tsx` 返回 exit 0
3. **全量测试通过**: `npx jest --passWithNoTests` 返回 exit 0，231+ 测试通过
4. **新模块有独立测试**: `src/__tests__/core/<module>/` 下新增测试文件
5. **向后兼容**: 现有 Agent 行为不变，ChatScreen 交互不受影响

---

## 6. 必须做 vs 绝对不准做

### MUST
- 消息总线包装 `delegate.ts` 的 `createAgentMessage()`，不删除现有接口
- 缓存层集成 `circuit-breaker.ts` 熔断器
- PromptVersioning 迁移现有 `VERSIONS` 硬编码为数据库存储
- 每个新模块编写对应的 `__tests__` 文件

### MUST NOT
- 联邦学习：不纳入本阶段计划（降级为调研备注）
- 删除或重写现有 `ToolRegistry` 接口
- 修改 `ChatScreen.tsx` 或任何 UI 层（纯架构/后端层优化）
- 引入新的第三方 npm 依赖（全部用已有依赖实现）

---

## 7. 风险与回滚

| 风险 | 影响 | 回滚策略 |
|------|------|----------|
| 消息总线引入延迟 | Agent 响应变慢 | 切换回直接调用（保留 `delegate.ts`） |
| 缓存不一致 | 显示过期数据 | 清空缓存 → 穿透数据源 |
| 提示词版本出错 | Agent 行为异常 | 回滚到上一激活版本 |
| 插件热加载失败 | Skill 不可用 | 保留启动时静态注册路径 |

---

## 8. 时间估算

| # | 任务 | 预计人天 |
|---|------|----------|
| 11 | 消息总线 | 1.5d |
| 12 | 缓存层 | 1.5d |
| 13 | 提示词版本管理 | 1.0d |
| 14 | 动态提示词生成器 | 1.0d |
| 15 | 插件热加载 | 1.5d |
| 16 | Agent 自省日志 | 1.0d |
| **合计** | | **7.5d** |
