# Phase 4: 架构演化与AI提示词优化 — 执行清单

> 关联规格: [spec.md](./spec.md) | 日期: 2026-05-25

---

## P0: 短期 (1-2 周)

### [ ] 11. 消息总线 (Message Bus)
**产出**: 松耦合 Agent 发布/订阅通信层

- [ ] 11.1 创建 `src/core/message-bus/message-bus.ts`
  - 实现 `MessageBus` 类：`publish()`, `subscribe()`, `unsubscribe()`
  - 支持 `broadcast` + 单 Agent 定向
  - `publish()` 返回 `Promise.all(handlers)` 保证顺序
  - 验证: `src/__tests__/core/message-bus.test.ts`
- [ ] 11.2 创建 `src/core/message-bus/dead-letter.ts`
  - handler 抛异常 → 存入死信队列 (`memory_engine` 表)
  - `retryDeadLetter()` 重放功能
  - 验证: 死信重放测试
- [ ] 11.3 创建 `src/core/message-bus/index.ts` 桶导出
- [ ] 11.4 改造 `master.agent.ts`: 用 MessageBus 替代直接 `handleIntent()` 调用
  - 保留原有 `delegate.ts` 接口作为 fallback
  - 验证: 现有 NLU 路由测试全部通过

### [ ] 12. 内存缓存层 (Cache Layer)
**产出**: TTL 缓存 + 穿透熔断

- [ ] 12.1 创建 `src/core/cache/memory-cache.ts`
  - `get<T>(key)`, `set<T>(key, value, ttlMs)`, `delete()`, `clear()`
  - 30 分钟默认 TTL，最大 500 条
  - 验证: `src/__tests__/core/cache.test.ts`
- [ ] 12.2 创建 `src/core/cache/cache-stats.ts`
  - `getStats()` → `{ hits, misses, size, hitRate, evictions }`
  - 验证: 统计准确性测试
- [ ] 12.3 创建 `src/core/cache/index.ts` 桶导出
- [ ] 12.4 集成：包装 `ToolRegistry` 调用链
  - 创建 `src/core/cache/tool-cache-wrapper.ts`
  - 对幂等工具 (`idempotent: true`) 自动缓存结果
  - 熔断器集成（复用 `circuit-breaker.ts`）：5 次穿透 → 熔断 60s
  - 验证: 缓存命中率测试 + 熔断触发测试

### [ ] 13. 提示词版本管理器 (Prompt Versioning)
**产出**: 版本升级 + 变更日志 + 回滚

- [ ] 13.1 创建 `src/core/cloud/prompts/prompt-versioning.ts`
  - `PromptVersion` 类型（agentId, version, prompt, changelog, createdAt, isActive）
  - `saveVersion()` / `loadActiveVersion()` / `listVersions()` / `rollbackTo()`
  - SQLite 持久化到 `prompt_versions` 表
  - 验证: `src/__tests__/cloud/prompt-versioning.test.ts`
- [ ] 13.2 迁移现有 `agent-prompts.ts`
  - 用 `PromptVersionManager.loadActiveVersion()` 替代硬编码 `PROMPTS`
  - 保留 `VERSIONS` 映射用于向后兼容
  - 启动时自动迁移：硬编码 prompt → DB 记录的 v1
  - 验证: 迁移测试 + 现有 prompt 内容不变

---

## P1: 中期 (3-4 周)

### [ ] 14. 动态提示词生成器 (Dynamic Prompt Builder)
**产出**: 模板变量替换 + 上下文注入 + Token 预算

- [ ] 14.1 创建 `src/core/cloud/prompts/prompt-builder.ts`
  - `buildPrompt({ agentId, context, userProfile, toolList })` → 完整 prompt 字符串
  - `{{variable}}` 模板语法解析
  - `truncateToTokenBudget(text, maxTokens)` — 中文按 char/3 估算
  - 验证: `src/__tests__/cloud/prompt-builder.test.ts`
- [ ] 14.2 定义 Prompt 模板结构
  - `PromptLayer { system, context, tools, constraints, examples }`
  - 每个 Agent 定义一份分层模板
  - 验证: 5 个 Agent 模板生成覆盖测试
- [ ] 14.3 集成到 `master.agent.ts`
  - 替换 `getAgentSystemPrompt()` + 手动拼接 → `PromptBuilder.build()`
  - 上下文注入：`ConversationContext.compressConversation()` 的 summary
  - 验证: 现有 LLM 调用路径不受影响

### [ ] 15. 插件热加载 (Skill Loader)
**产出**: 基于 SkillRegistry 的运行时发现/加载

- [ ] 15.1 创建 `src/core/skills/skill-loader.ts`
  - `scanPluginDir(dirPath)` → 发现 `manifest.json` + 入口文件
  - `loadPlugin(manifest)` → 调用 `registerSkill()` + 钩子执行
  - `reloadPlugin(name)` → `uninstallSkill()` → `loadPlugin()`
  - `getLoadedPlugins()` → 状态列表
  - 验证: `src/__tests__/core/skill-loader.test.ts`
- [ ] 15.2 定义 `manifest.json` 规范
  - 字段: `{ name, version, entryPoint, permissions, dependencies, hooks }`
  - 版本使用 SemVer 格式 (`semver.coerce` 兼容)
  - 验证: manifest 校验器测试
- [ ] 15.3 增强 `skill-registry.ts`：SemVer 依赖检查
  - `verifyDependencies()` 升级：检查版本范围 (如 `>=1.0.0`)
  - 保留原有精确匹配路径为 fallback
  - 验证: 版本依赖冲突测试

---

## P2: 长期 (4-6 周)

### [ ] 16. Agent 自省与日志增强 (Agent Introspection)
**产出**: 结构化审计日志 + 熔断自恢复

- [ ] 16.1 工具调用耗时统计
  - 包装 `ToolEntry.handler` → 自动记录 `{ toolName, durationMs, success, errorCode }`
  - 耗时 > `definition.timeout * 0.8` 标记为 `slow` 警告
  - 验证: `src/__tests__/core/logger/agent-introspection.test.ts`
- [ ] 16.2 Agent 决策链追踪
  - 每次 `processMessage()` → 生成 `traceId`
  - 记录: `[NLU → Route → ToolCall → Result]` 完整链路
  - 验证: 决策链可查询测试
- [ ] 16.3 熔断器事件自动记录
  - `circuit-breaker.ts` 的 `open`/`halfOpen`/`close` 事件 → 写入审计日志
  - `getCircuitBreakerHistory()` 查询接口
  - 验证: 熔断事件记录测试
- [ ] 16.4 日志级别动态调整
  - `setLogLevel(level)` 运行时切换
  - `enableDebugMode(agentId)` 按 Agent 开启
  - 验证: 动态级别切换测试

---

## 验证命令

每个任务完成后运行：
```bash
npx tsc --noEmit        # TypeScript 编译
npx eslint . --ext .ts,.tsx  # ESLint
npx jest                # 全量测试 (≥231 通过)
```
