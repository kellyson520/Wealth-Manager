---
name: wealth-manager
version: 1.0.0
description:
  zh: "Wealth Manager 项目全套开发标准——AI 原生对话式记账系统"
  en: "Complete development standards for Wealth Manager - AI-native conversational accounting system"
author:
  name: "Wealth Manager Team"
icon: "💰"
category: automation
tags: [记账, 财务, AI, Multi-Agent, Flutter, React Native, 标准规范]
minAppVersion: "1.0.0"
run_as: inline
model: default
allowed_tools: []
permissions:
  data: []
  network: none
  ai:
    enabled: false
  storage: 0
pricing:
  type: free
---

# Wealth Manager 项目开发标准

> **项目代号**：WM | **版本**：V4.0
> **一句话定义**：一款完全由对话驱动的个人财务智能体——用户用自然语言完成所有财务操作，App 没有传统界面。

---

## 文档索引

本技能整合以下 13 份标准文档的核心内容，详细内容请查阅源文件：

| 编号 | 文件 | 内容 |
|------|------|------|
| 00 | 项目总纲与术语表.md | 愿景、创新点、文档体系 |
| 01 | 技术架构标准.md | 四层架构、技术选型、组件通信 |
| 02 | 功能实现标准.md | 五大 Agent、80+ 工具集 |
| 03 | 数据模型标准.md | 核心表结构、哈希链、加密存储 |
| 04 | 安全标准.md | 权限分级、Guardian、熔断、隐私 |
| 05 | 测试与性能标准.md | 性能指标、测试金字塔 |
| 06 | UI设计标准.md | 对话界面、图表卡片、视觉系统 |
| 07 | 接口与集成标准.md | Agent 消息协议、工具注册 |
| 08 | 部署与运维标准.md | CI/CD、构建、监控 |
| 09 | 国际化与本地化标准.md | 多语言、多币种 |
| 10 | 错误处理与日志标准.md | 错误码、日志分级 |
| 11 | Skill 开发标准.md | SKILL.md 格式、生命周期 |
| 12 | 数据备份与灾难恢复标准.md | 备份策略、恢复流程 |

---

## 1. 核心创新与设计原则

### 1.1 核心创新
| 创新点 | 描述 |
|--------|------|
| **纯对话界面** | 零菜单、零表单，AI 主动服务 |
| **Multi-Agent 协作** | Master、Ledger、Analyst、Coach、Guardian 五大智能体 |
| **80+ 本地工具** | 金额计算和分类完全本地，保证精确和隐私 |
| **AI 动态可视化** | AI 输出 ECharts 配置 JSON，WebView 渲染 |
| **人教 AI 规则** | 对话教会 AI 分类，规则永久生效可分享 |
| **Skill + 记忆 + 人格** | 可插拔技能、四层记忆、三维人格 |
| **纯本地定时提醒** | 无云推送 |
| **链式哈希审计** | 每笔账单附带哈希指纹 |
| **WebDAV 加密备份** | 用户自主存储，端到端加密 |
| **AI 安全边界** | 权限分级、熔断、防发疯 |

### 1.2 设计原则
- **本地优先**：数据存本地，仅必要且脱敏后才上传云端
- **隐私第一**：Guardian Agent 实时监控，所有云端数据强制脱敏
- **对话驱动**：所有操作通过自然语言完成
- **渐进式呈现**：信息按重要性分层展示（摘要 → 详情 → 原始数据）

---

## 2. 技术架构标准

### 2.1 四层架构

```
┌────────────────────────────────────────────────────┐
│                   表现层 (UI Layer)                  │
│  纯对话界面 (Flutter/React Native)                   │
│  + 系统 WebView 图表沙箱 (ECharts)                   │
│  + 桌面/锁屏小组件 + Siri/Google 快捷指令             │
└───────────────────────┬────────────────────────────┘
                        │
┌───────────────────────▼────────────────────────────┐
│              智能体协作层 (Agent Orchestration)       │
│  Master Agent (意图路由)                             │
│  Ledger Agent | Analyst Agent | Coach Agent | Guardian Agent │
└───────────────────────┬────────────────────────────┘
                        │
┌───────────────────────▼────────────────────────────┐
│              本地工具调用层 (Tool Executor)            │
│  80+ 工具：账单/资产/债务/报销/预算/图表/安全/备份...  │
└───────────────────────┬────────────────────────────┘
                        │
┌───────────────────────▼────────────────────────────┐
│              本地数据与引擎层 (Local Core)             │
│  加密 SQLite | 向量库 | 规则引擎 | 端侧模型(可选)     │
│  哈希链 | 记忆系统 | 人格参数 | Skill 注册表         │
└───────────────────────┬────────────────────────────┘
                        │ (仅必要且脱敏后)
                        ▼
┌────────────────────────────────────────────────────┐
│                云端 AI API (GPT-4o / Claude 等)      │
└────────────────────────────────────────────────────┘
```

### 2.2 各层职责约束
| 层级 | 职责 | 约束 |
|------|------|------|
| 表现层 | 纯对话 UI 渲染、WebView 图表展示、小组件 | 不持有业务逻辑，仅做展示和事件传递 |
| 智能体协作层 | 意图解析、任务分发、结果汇总 | Master 为唯一入口，Agent 间通过消息总线通信 |
| 本地工具调用层 | 工具注册、执行、结果返回 | 所有工具必须幂等可重试，支持超时终止 |
| 本地数据与引擎层 | 持久化存储、向量检索、规则匹配、加密 | SQLite 必须加密，哈希链不可变 |

### 2.3 技术选型
| 组件 | 选型 |
|------|------|
| 客户端框架 | Flutter 或 React Native |
| 本地数据库 | SQLite (加密) |
| 向量存储 | 本地向量库 |
| 图表渲染 | ECharts (WebView 沙箱) |
| 加密算法 | AES-256 |
| 哈希算法 | SHA-256 链式哈希 |
| 云端 AI | GPT-4o / Claude API |

### 2.4 目录结构规范

```
src/
├── ui/                  # 表现层
│   ├── chat/            # 对话界面
│   ├── charts/          # WebView 图表沙箱
│   └── widgets/         # 桌面/锁屏小组件
├── agents/              # 智能体协作层
│   ├── master/
│   ├── ledger/
│   ├── analyst/
│   ├── coach/
│   └── guardian/
├── tools/               # 本地工具调用层
│   ├── bills/           # 账单操作
│   ├── stats/           # 统计与图表
│   ├── rules/           # 分类规则
│   ├── security/        # 安全与审计
│   ├── automation/      # 自动化任务
│   ├── assets/          # 资产账户
│   ├── import/          # 导入解析
│   ├── debt/            # 债务与信用
│   ├── reimbursement/   # 报销管理
│   ├── budget/          # 预算与储蓄
│   ├── tags/            # 标签与备注
│   ├── data/            # 数据维护
│   ├── sharing/         # 共享协作
│   ├── gamification/    # 体验与成就
│   └── webdav/          # WebDAV 备份
├── core/                # 本地数据与引擎层
│   ├── database/
│   ├── vector/
│   ├── rules/
│   ├── hashchain/
│   ├── memory/
│   ├── persona/
│   └── skills/
└── shared/
    ├── types/
    ├── utils/
    └── constants/
```

### 2.5 命名规范
| 类型 | 规范 | 示例 |
|------|------|------|
| Agent 文件 | `{name}.agent.ts` | `master.agent.ts` |
| 工具文件 | `{verb}_{noun}.tool.ts` | `add_bill.tool.ts` |
| 数据库迁移 | `{timestamp}_{description}.sql` | `20250101_init.sql` |
| 类型定义 | PascalCase | `BillRecord`, `AgentMessage` |
| 工具名称 | snake_case | `add_bill`, `search_bills` |

### 2.6 云端通信原则
- **仅必要且脱敏后**才向云端 API 发送数据
- 发送前必须经 Guardian Agent 脱敏处理
- 云端仅承担推理任务，不持久化任何用户数据

---

## 3. 五大智能体 (Agent)

| Agent | 运行位置 | 核心职责 | 禁止行为 |
|-------|----------|----------|----------|
| **Master Agent** | 本地意图分类 + 云端复杂推理 | 唯一入口，意图解析，任务分发，结果汇总 | 不得直接操作数据库 |
| **Ledger Agent** | 本地工具为主 | 极速记账、查账、文件导入、OCR、转账、退款 | 不得执行安全扫描 |
| **Analyst Agent** | 本地聚合 + 云端分析 | 统计、趋势检测、异常发现、图表配置生成 | 不得修改账单数据 |
| **Coach Agent** | 云端 + 人格参数 | 预算建议、储蓄挑战、情绪陪伴、成就激励 | 不得访问原始交易数据 |
| **Guardian Agent** | 纯本地 | 实时安全扫描、诈骗预警、无用订阅检测、数据脱敏、AI 行为拦截 | 不得向云端发送任何数据 |

### 3.1 Agent 实现要求
- 每个 Agent 为独立模块，可单独测试、部署、更新
- Agent 必须声明自己的工具依赖列表
- 每个 Agent 的错误必须隔离，不得导致其他 Agent 崩溃
- 所有 Agent 的操作必须可审计（写入 audit_log）

---

## 4. 工具集规范 (80+ 工具)

### 4.1 工具命名规范
- 格式：`{命名空间}.{动作}_{对象}`
- 动作动词：add / get / search / update / delete / create / remove / mark / settle / export / import / configure / trigger / list / test / register / schedule / parse / apply / guess / match / run / verify / repair / revoke / analyze / sanitize / split / attach / leave / clear

### 4.2 工具分类
| 命名空间 | 工具数 | 说明 |
|----------|--------|------|
| bills | 12 | 账单操作 (add/search/get/modify/delete/split/refund/import) |
| stats | 8 | 统计与图表 (aggregation/budget/net_balance/chart/trend) |
| rules | 7 | 分类规则 (add/search/update/delete/match/guess/apply) |
| security | 9 | 安全审计 (safety_check/subscriptions/sanitize/verify/repair/privacy) |
| automation | 6 | 自动化 (recurring_task/notification/shortcut) |
| assets | 3 | 资产 (update_balance/transfer/overview) |
| import | 3 | 导入 (parse_tabular/apply_mapping/guess_mapping) |
| debt | 4 | 债务 (loan/debt_status/settle/credit_card) |
| reimbursement | 3 | 报销 (mark/get_list/settle) |
| budget | 3 | 预算 (set_budget/savings_goal/progress) |
| tags | 4 | 标签 (add_tags/remove_tag/update_note/attach_image) |
| data | 4 | 数据维护 (export/import/merge/verify) |
| sharing | 3 | 共享 (create_link/leave_shared/delete_link) |
| gamification | 4 | 成就 (achievements/streak/level/challenge) |
| webdav | 5 | WebDAV 备份 (trigger/restore/configure/test/list) |

### 4.3 工具通用要求
- 所有工具必须幂等可重试
- 单次工具调用超时：≤ 5 秒
- 每次调用写入 audit_log
- 按权限级别执行（0级 Safe / 1级 Write / 2级 Sensitive）

---

## 5. 数据模型标准

### 5.1 数据库选型
- **引擎**：SQLite (SQLCipher 加密)
- **向量存储**：本地向量库（与 SQLite 分离）
- **迁移策略**：版本化迁移脚本，向前兼容

### 5.2 核心表

**账单表 (bills)**
```sql
CREATE TABLE bills (
  id TEXT PRIMARY KEY,
  amount REAL NOT NULL,
  type TEXT NOT NULL CHECK(type IN ('income','expense','refund')),
  category_id TEXT,
  tags TEXT,                    -- JSON 数组
  merchant TEXT,
  raw_description TEXT,
  date TEXT NOT NULL,            -- ISO 8601
  note TEXT,
  emotion_score INT,            -- 1-5
  images TEXT,                  -- 图片路径 JSON 数组
  source TEXT DEFAULT 'manual', -- manual/import/auto/ocr
  refund_original_id TEXT,
  hash_chain TEXT NOT NULL,     -- SHA-256 链式哈希
  previous_hash TEXT,
  created_at TEXT NOT NULL
);
```

**分类规则表 (classification_rules)**
```sql
CREATE TABLE classification_rules (
  id TEXT PRIMARY KEY,
  pattern TEXT NOT NULL,
  category_id TEXT,
  merchant TEXT,
  tags TEXT,
  confidence REAL DEFAULT 1.0
);
```

**资产账户表 (asset_accounts)**
```sql
CREATE TABLE asset_accounts (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK(type IN ('cash','bank','credit','investment','other')),
  balance REAL NOT NULL,
  currency TEXT DEFAULT 'CNY',
  updated_at TEXT NOT NULL
);
```

**记忆表 (memories)**
```sql
CREATE TABLE memories (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL CHECK(type IN ('long_term','episodic')),
  content TEXT NOT NULL,
  embedding BLOB,
  updated_at TEXT
);
```

**用户画像表 (user_profile)** — 单例表 (id='singleton')
- persona_params: JSON (严谨度/幽默度/主动度)
- budget_limits: JSON (各分类预算上限)
- preferences: JSON (用户偏好设置)

**审计日志表 (audit_log)**
```sql
CREATE TABLE audit_log (
  id TEXT PRIMARY KEY,
  timestamp TEXT NOT NULL,
  agent TEXT NOT NULL,
  tool TEXT NOT NULL,
  action TEXT NOT NULL,
  params TEXT,
  result_status TEXT,   -- success/error/rejected/timeout
  user_confirmed INTEGER DEFAULT 0,
  error_code TEXT,
  ttl_days INTEGER DEFAULT 365
);
```

### 5.3 哈希链机制
- 每笔账单记录 `hash_chain` = SHA-256(previous_hash + bill_data)
- `previous_hash` 指向前一条账单的 hash_chain
- 工具 `verify_hash_chain` 用于全量校验
- 工具 `repair_hash_chain` 用于修复断裂（需 2 级权限）

---

## 6. 安全标准

### 6.1 权限分级
| 级别 | 名称 | 描述 | 执行策略 |
|------|------|------|----------|
| **0级 (Safe)** | 只读查询 | 不修改任何数据 | 直接执行，无需确认 |
| **1级 (Write)** | 创建/修改可逆 | 新增或修改单条记录 | 连续 ≤ 5 次无需确认；超过需确认；金额异常时 Guardian 插入确认卡片 |
| **2级 (Sensitive)** | 删除/批量/财务 | 不可逆或多条记录操作 | 每次必须用户显式确认；部分需二次验证 |

### 6.2 防滥用控制
| 限制项 | 阈值 | 触发动作 |
|--------|------|----------|
| 单次请求工具调用 | ≤ 20 次 | 超出拒绝 |
| 递归检测 | 连续 3 次相同调用且参数无意义变化 | 中断请求 |
| 高频记账 | 5 分钟内 > 20 笔 | Guardian 拦截要求确认 |
| 月度 Token 80% | 警告 | 通知用户 |
| 月度 Token 100% | 阻断所有云端调用 | 仅本地工具可用 |

### 6.3 超时终止
| 场景 | 超时 | 动作 |
|------|------|------|
| 单次对话 | 30 秒 | 强制终止 |
| 单次工具调用 | 5 秒 | 返回 timeout 错误 |
| 云端 API 调用 | 10 秒 | 降级为本地处理 |

### 6.4 Guardian Agent 拦截规则
- **交易异常**：单笔 > 历史月均值×3 → 确认卡片；5 分钟 > 20 笔 → 冻结
- **隐私泄露**：原始商家名/金额序列泄露 → 自动屏蔽
- **云端脱敏**：`sanitize_for_cloud` 强制脱敏后再发送
- **规则污染**：AI 添加规则若误分类率 > 20% → 回滚并警告

### 6.5 安全模式
- 连续 3 次拒绝后自动进入安全模式（所有操作逐一确认）
- 紧急熔断触发：单次操作影响 > 50 条记录 → 回滚并冻结

---

## 7. 测试与性能标准

### 7.1 性能指标
| 场景 | Token | 响应时间 | 优先级 |
|------|-------|----------|--------|
| 简单记账 | 0 (纯本地) | < 100ms | P0 |
| 规则教学 | ~200 | < 2s | P1 |
| 月度报表 | ~400 | < 2s | P1 |
| 深度分析+建议 | ~600 | < 3s | P2 |
| 安全扫描 | 0 (纯本地) | < 50ms | P0 |
| 1000行 CSV 导入 | 0 | < 3s | P1 |
| WebDAV 备份 | 0 | < 30s (100MB) | P2 |
| WebDAV 恢复 | 0 | < 60s (100MB) | P2 |

### 7.2 测试金字塔
```
         ┌──────┐
         │ E2E  │  关键用户旅程 (≥10个)
        ┌┴──────┴┐
        │ 集成测试 │  Agent 协作 + 工具链
       ┌┴─────────┴┐
       │  单元测试   │  每个工具独立测试 (≥90%覆盖率)
      ┌┴────────────┴┐
      │  静态分析     │  TypeScript strict + ESLint
     └───────────────┘
```

### 7.3 本地资源限制
| 资源 | 限制 | 说明 |
|------|------|------|
| 数据库大小 | < 500MB (含图片) | 超出提示归档 |
| 内存占用 | < 150MB (运行时) | 后台 < 50MB |
| CPU 占用 | 后台 < 5% | 低优先级 |
| 电池消耗 | 后台 < 2%/小时 | 仅 WiFi 下备份 |

---

## 8. UI 设计标准

### 8.1 核心设计理念
| 原则 | 说明 |
|------|------|
| **对话即界面** | 零菜单、零表单、零导航栏 |
| **AI 主动服务** | 启动时展示今日概览卡片 |
| **渐进式呈现** | 摘要 → 详情 → 原始数据 |
| **即时反馈** | 每次操作 < 200ms 给反馈 |
| **可信赖感** | 关键操作有确认、金额有强调、异常有警示 |

### 8.2 反模式（禁止）
- ❌ 传统侧边栏导航菜单
- ❌ 多级表单页面
- ❌ 模态弹窗阻断对话流
- ❌ 纯文本长列表
- ❌ AI 回复无差异化样式

### 8.3 界面布局
```
┌─────────────────────────────────┐
│  Status Bar                     │
├─────────────────────────────────┤
│  Title Bar (当前上下文标签)      │  ← 可折叠
├─────────────────────────────────┤
│  消息列表 (Message List)         │
│  ┌──────────────────────────┐   │
│  │ 用户消息气泡 (右对齐)      │   │
│  └──────────────────────────┘   │
│  ┌──────────────────────────┐   │
│  │ AI 消息气泡 (左对齐)      │   │
│  │ 可嵌套：图表卡片/确认卡片  │   │
│  └──────────────────────────┘   │
│  ┌──────────────────────────┐   │
│  │ 系统消息 (居中，灰色)      │   │
│  └──────────────────────────┘   │
├─────────────────────────────────┤
│  Quick Bar (快捷操作建议)        │  ← 3-5 个上下文相关按钮
├─────────────────────────────────┤
│  Input Bar (输入区域)            │
│  [🎤语音] [📎附件] [✏️____] [📤] │
└─────────────────────────────────┘
```

### 8.4 消息类型规范
| 类型 | 样式 | 用法 |
|------|------|------|
| 用户消息 | 右对齐，主色气泡 | 用户输入 |
| AI 文本 | 左对齐，白底气泡 | AI 文字回复 |
| AI 卡片 | 左对齐，圆角卡片 + 阴影 | 图表/账单详情/确认 |
| 系统消息 | 居中，灰色小字 | 状态变化、错误提示 |
| 确认卡片 | 左对齐，橙色边框 | Guardian 安全确认 |

### 8.5 图表卡片规范
- AI 输出 ECharts 配置 JSON
- 图表在独立 WebView 沙箱中渲染
- 支持类型：柱状图、饼图、折线图、热力图、桑基图
- 每张图表卡片必须有标题和可选的时间范围标签

---

## 9. 接口与集成标准

### 9.1 Agent 消息协议
```typescript
interface AgentMessage {
  messageId: string;           // UUID v4
  timestamp: string;           // ISO 8601
  ttl: number;                 // 生存时间 (ms)，默认 30000

  source: AgentId;             // 'master' | 'ledger' | 'analyst' | 'coach' | 'guardian'
  target: AgentId | 'broadcast';
  replyTo?: string;            // 关联的请求 messageId

  type: MessageType;           // 见下方
  payload: MessagePayload;

  priority: 'normal' | 'high' | 'critical';
  traceId: string;             // 全链路追踪 ID
}
```

**消息类型**：
- `intent.classify` / `intent.result`
- `task.execute` / `task.result` / `task.progress`
- `safety.check` / `safety.veto` / `safety.confirm_card`
- `context.query` / `context.update`
- `system.event` / `system.error`

### 9.2 典型记账消息流
```
User → Master: "午饭花了35块"
  Master → MessageBus: { type: "intent.classify", payload: { text: "午饭花了35块" } }
  Master: 意图 = record_bill, 参数 = { merchant: "午饭", amount: 35 }
  Master → Guardian: { type: "safety.check" }
  Guardian → Master: 通过
  Master → Ledger: { type: "task.execute", payload: { tool: "add_bill", params } }
  Ledger → Master: { type: "task.result", payload: { billId, hash_chain } }
  Master → User: "已记录：午饭 ¥35.00"
```

### 9.3 集成方式
| 集成 | 方式 | 说明 |
|------|------|------|
| Siri / Google 快捷指令 | Native Intent API | 快速记账 |
| WebDAV 备份 | 标准 WebDAV 协议 | 自建备份 |
| 文件导入 | CSV/Excel/PDF 解析 | 账单导入 |
| 云端 AI | REST API (HTTPS) | 加密通信 |

---

## 10. CI/CD 与部署

### 10.1 流水线阶段
```
Git Push → 静态检查(2min) → 单元测试(5min) → 集成测试(8min) → 构建(10min) → TestFlight/Internal Track → 发布
```

### 10.2 分支策略
| 分支 | 用途 | 保护 |
|------|------|------|
| `main` | 生产代码 | 禁止直接 push，需 PR + 审批 + CI |
| `develop` | 开发主线 | 需 PR + CI 通过 |
| `feature/*` | 功能分支 | 从 develop 创建，合并到 develop |
| `hotfix/*` | 紧急修复 | 从 main 创建，合并到 main + develop |
| `release/*` | 发布准备 | 从 develop 创建，合并到 main |

### 10.3 构建产物
| 平台 | 格式 | 大小目标 |
|------|------|----------|
| iOS | .ipa (App Store) | < 80MB |
| Android | .aab (App Bundle) | < 50MB |

---

## 11. 国际化与本地化

### 11.1 支持语言
| 优先级 | 语言 | 代码 | 阶段 |
|--------|------|------|------|
| P0 | 简体中文 | zh-Hans | Phase 1 |
| P0 | 英语 | en | Phase 1 |
| P1 | 繁体中文 | zh-Hant | Phase 3 |
| P1 | 日语 | ja | Phase 4 |
| P2 | 韩语 | ko | Phase 5 |

### 11.2 翻译原则
| 原则 | 说明 |
|------|------|
| 语境完整 | Key 名要体现语境（如 `bill.delete_confirm`） |
| 避免拼接 | 用插值，不拆句（`"{{merchant}}: ¥{{amount}}"`） |
| 单复数 | 使用 i18n 复数规则 |
| 语气一致 | 中文偏亲切，英文偏简洁 |
| 金融术语准确 | refund→退款, balance→余额 |

### 11.3 AI 回复多语言
- AI 回复默认跟随 App 界面语言
- 用户可手动切换 AI 回复语言
- 用户用哪种语言输入，AI 用同种语言回复

---

## 12. 错误处理与日志

### 12.1 错误码体系
```
格式: {领域}{子系统}{具体错误} (1位+2位+3位)
1xxx - 账单 (Bill)      6xxx - 导入导出
2xxx - 分类规则 (Rule)   7xxx - AI/云端
3xxx - 资产 (Asset)      8xxx - 系统
4xxx - 安全 (Security)   9xxx - 通用
5xxx - 备份 (Backup)
```

**关键错误码示例**：
| 错误码 | 名称 | 可重试 | 用户提示 |
|--------|------|--------|----------|
| 1001 | BILL_NOT_FOUND | 否 | "找不到这笔账单" |
| 1005 | BILL_HASH_BROKEN | 否 | "数据完整性异常，请修复" |
| 4001 | PERMISSION_DENIED | 否 | "需要确认才能执行" |
| 4003 | SAFETY_BLOCKED | 否 | "该操作已被安全拦截" |
| 4004 | TOKEN_EXHAUSTED | 否(下月) | "本月云端额度已用完" |
| 5002 | WEBDAV_CONNECTION_FAILED | 是 | "无法连接到备份服务器" |

### 12.2 日志分级
| 级别 | 用途 | 示例 |
|------|------|------|
| ERROR | 错误/异常 | 工具执行失败、哈希链断裂 |
| WARN | 警告 | Token 接近上限、连接不稳定 |
| INFO | 关键操作 | 用户登录、备份完成、安全扫描 |
| DEBUG | 调试信息 | 工具调用详情、Agent 消息 |
| TRACE | 详细追踪 | 函数入参出参 |

---

## 13. Skill 开发标准

### 13.1 SKILL.md 格式
```markdown
---
name: my-skill
version: 1.0.0
description:
  zh: "技能描述"
  en: "Skill description"
author:
  name: "作者"
icon: "🔧"
category: classification | analysis | integration | automation | persona | report
tags: [标签1, 标签2]
minAppVersion: "1.0.0"
run_as: inline | subagent
model: default | deepseek-v4-flash | deepseek-v4-pro
allowed_tools:
  - tool.name
permissions:
  data: [bills.read, rules.write]
  network: none | optional | required
  ai:
    enabled: false
    max_tokens_per_call: 200
    max_tokens_per_day: 2000
  storage: 1mb
config:
  - key: param_name
    type: select | boolean | string | number
    default: value
    label: { zh: "标签", en: "Label" }
hooks:
  on_install: "SKILL.md#on-install"
  on_uninstall: "SKILL.md#on-uninstall"
pricing:
  type: free | paid | subscription
---
# 技能标题

## 功能说明
技能功能描述...

## 触发条件
触发条件...
```

### 13.2 生命周期
```
未安装 → (install) → 已安装(禁用) → (enable) → 已启用 ⇄ (disable) → 已安装(禁用)
                                          ↓ (upgrade)
                                       升级中... → 已启用 / 回滚到旧版
```

---

## 14. 数据备份与灾难恢复

### 14.1 备份层级
| 级别 | 方式 | 保留 | 恢复 |
|------|------|------|------|
| Level 1: WAL 自动 | 每次写入前 WAL checkpoint | 最近 100 个 WAL 帧 | 即时自动 |
| Level 2: 本地快照 | 每日凌晨自动（充电+WiFi） | 最近 7 个快照 | 手动触发 |
| Level 3: WebDAV 远程 | 手动/定时自动 | 最近 7 个版本 | 换设备/灾难恢复 |

### 14.2 备份加密
- 算法：AES-256-GCM
- 密钥：用户设置的备份密码（PBKDF2 派生）
- 端到端加密：服务端无法解密

### 14.3 灾难场景
| 场景 | 恢复方式 | RTO |
|------|----------|-----|
| 误删 APP | WebDAV 恢复 | < 5 min |
| 换手机 | WebDAV 恢复 | < 5 min |
| WebDAV 服务器故障 | 本地快照 | < 1 min |
| 哈希链断裂 | repair_hash_chain 修复 | < 1 min |
| 数据库损坏 | 本地快照恢复 | < 2 min |
