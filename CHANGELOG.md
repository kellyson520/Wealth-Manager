# 更新日志

本文档遵循 [语义化版本](https://semver.org/lang/zh-CN/) 规范。

---

## [0.2.1] — 2026-05-24

### 新增

#### 统一错误日志系统 (`src/core/logger/`)

- **核心 Logger** (`logger.ts`): 全局单例日志服务
  - 5 级日志：`debug` / `info` / `warn` / `error` / `fatal`
  - 内存环形缓冲区（上限 500 条，溢出时裁剪最早 100 条）
  - `captureError(tag, error, context?)` 辅助函数，自动提取 `Error.stack`
  - `exportString()` 一键导出全部日志为格式化文本
  - `subscribe(fn)` 实时订阅日志变更
- **日志查看器** (`src/ui/logger/LogScreen.tsx`):
  - 实时日志流，支持按级别筛选（全部/ERROR/WARN/INFO/DEBUG）
  - 每条日志显示时间戳、级别标签、来源模块、消息
  - **复制全部**按钮：一键导出所有日志到剪贴板
  - 长按单条日志可复制该条
  - 点击展开查看完整调用栈
- **全局错误边界**: `ChatScreen` 启动时注册 `ErrorUtils.setGlobalHandler`，捕获所有未处理异常
- **全量 catch 注入**: 22 个工具函数 + 3 个记忆函数的每个 catch 块均接入 `captureError`

#### Agent 技能系统完善 (`.opencode/skills/`)

- 9 个 Agent 技能文件统一新增三个节段：
  - **🛠️ 原生工具速查**: 每个 Agent 的可用工具表格（`read`/`write`/`edit`/`glob`/`grep`/`bash`/`webfetch`/`task`/`skill`/`question`/`todowrite`）
  - **🔒 安全准则**: 每个 Agent 角色的专属安全约束
  - **🧠 核心能力**: 记忆写入、技能加载、任务委派的具体用法
- 新增 3 个公共引用文件 (`.opencode/skills/_shared/`):
  - `tool-reference.md`: 11 个原生工具清单及使用规则
  - `security-guidelines.md`: 5 条绝对禁令 + 每个 Agent 安全职责表
  - `agent-capabilities.md`: 记忆持久化、`skill` 加载、`task` 委派完整指南
- 修复全部旧工具名引用：`grep_search` → `grep`，`view_file` → `read`，`replace_file_content` → `edit`，`search_web` → `webfetch`

### 修复

#### 自动化工具 (`src/tools/automation/`)

- **`register_shortcut` 返回虚假成功**：数据库插入失败时 catch 块返回 `success: true`，但没有任何内存存储来兜底，导致调用方认为快捷指令已注册、实际却被静默丢弃。修正为返回错误。
- **`delete_recurring_task` 删除不存在的任务无报错**：对不存在的 taskId 执行 DELETE 后直接返回 `success: true`，未校验 `result.changes`。修正为检测零行变更时返回任务不存在。

#### CI / 构建

- `assembleDebug` → `assembleRelease`：debug APK 不含 JS bundle 导致白屏，改为 release 打包将 bundle 嵌入 assets
- `tsconfig.json` 排除 `__tests__` 目录，修复 typecheck 因 Jest 全局变量报错

### 变更明细

| 类别 | 新增 | 修改 |
|------|------|------|
| Logger 核心 | 2 文件 | — |
| LogScreen UI | 2 文件 | — |
| Agent 技能 | 3 文件 | 9 文件 |
| catch 注入 | — | 7 文件 (22+3 处) |
| CI / 构建 | — | 2 文件 |
| 依赖 | `expo-clipboard` | — |

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
