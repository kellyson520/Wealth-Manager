# Skill 开发标准 V2.0

> 适用范围：Skill 文件格式、清单规范、生命周期、权限模型、市场规范
> 兼容参照：MCP Tool Schema、OpenAI GPT Actions、Cursor Rules、Reasonix SKILL.md

---

## 1. 设计原则

### 1.1 核心理念

| 原则 | 说明 |
|------|------|
| **单文件优先** | 一个 Skill = 一个 `SKILL.md`，元数据和指令合一 |
| **Markdown 原生** | 指令体为标准 Markdown，人机共读 |
| **YAML 前置元数据** | 机器解析用 frontmatter，人类阅读时自然折叠 |
| **生态兼容** | 一份文件可映射到 MCP Tool / OpenAI GPT / Cursor Rule |

### 1.2 与主流生态的对标

| 本系统概念 | MCP 对应 | OpenAI 对应 | Cursor 对应 |
|-----------|----------|-------------|-------------|
| SKILL.md | `tools/list` 返回的 Tool | GPT Action | `.cursor/rules/*.md` |
| `name` | `tool.name` | `action.name` | 文件名 |
| `description` | `tool.description` | `action.description` | — |
| `params` | `tool.inputSchema` | `action.parameters` | — |
| `instructions` (body) | — | `instructions` | 文件正文 |
| `allowed_tools` | — | — | — |

---

## 2. SKILL.md 文件格式

### 2.1 完整模板

```markdown
---
# ===== 必填 =====
name: meal-classifier
version: 1.2.0
description:
  zh: "自动识别外卖平台账单，精准分类到具体菜系"
  en: "Auto-classify food delivery bills by cuisine type"

# ===== 可选 =====
author:
  name: "开发者名"
  url: "https://github.com/example"
icon: "🍔"
category: classification          # classification | analysis | integration | automation | persona | report
tags: [外卖, 餐饮, 自动分类]
minAppVersion: "1.0.0"

# ===== 运行配置 =====
run_as: inline                     # inline | subagent (需要独立沙箱时)
model: default                     # default | deepseek-v4-flash | deepseek-v4-pro
allowed_tools:                     # 工具白名单，空 = 继承父级
  - bills.add_bill
  - bills.search_bills
  - rules.add_rule
  - rules.match_bill

# ===== 权限声明 =====
permissions:
  data: [bills.read, rules.write]
  network: optional                # none | optional | required
  ai:
    enabled: false
    max_tokens_per_call: 200
    max_tokens_per_day: 2000
  storage: 1mb                     # 独立键值存储上限

# ===== 用户可配置项 =====
config:
  - key: preferred_cuisine
    type: select
    default: auto
    label: { zh: "偏好菜系", en: "Preferred Cuisine" }
    options:
      - { value: auto, label: { zh: "自动", en: "Auto" } }
      - { value: chinese, label: { zh: "中餐", en: "Chinese" } }
      - { value: western, label: { zh: "西餐", en: "Western" } }

  - key: auto_tag
    type: boolean
    default: true
    label: { zh: "自动打标签", en: "Auto Tagging" }

# ===== 生命周期钩子 =====
hooks:
  on_install: "SKILL.md#on-install"
  on_uninstall: "SKILL.md#on-uninstall"
  on_enable: null
  on_disable: null

# ===== 定价 =====
pricing:
  type: free                      # free | paid | subscription
  price_usd: null

# ===== 生态映射（自动生成，可手动覆盖） =====
mcp:
  server_name: meal-classifier
  tool_name: classify_food_delivery
openai:
  action_name: classifyFoodDelivery
---

# 外卖账单精准分类

## 功能说明

当用户创建新账单时，自动检测是否为外卖平台消费（美团、饿了么、DoorDash 等），
并从账单描述中提取菜系信息（中餐、日料、快餐等），自动完成分类和标签。

## 触发条件

- 事件：`bill.created`（新账单创建时）
- 检测：商户名匹配外卖平台关键词

## 分类逻辑

1. 平台检测 → 确定一级分类（餐饮）
2. 关键词匹配 → 确定菜系子分类
3. 规则沉淀 → 学习了就记住，下次直接命中

## 安装

安装后无需额外配置，开箱即用。可在设置中调整菜系偏好。

## 卸载

卸载时会清理该 Skill 创建的分类规则，你的手动规则不受影响。

---

## 钩子实现

### on-install

初始化外卖平台关键词缓存和菜系关键词表。

### on-uninstall

1. 查询所有 `source = "skill:meal-classifier"` 的规则
2. 删除这些规则（不影响用户手动规则）
3. 清理 Skill 独立存储
```

### 2.2 字段说明

| 字段 | 必填 | 类型 | 说明 |
|------|:---:|------|------|
| `name` | ✅ | string | 唯一标识符，字母/数字/`-`/`_`，≤ 64 字符 |
| `version` | ✅ | string | 语义版本 MAJOR.MINOR.PATCH |
| `description` | ✅ | string \| i18n | 单行或 `{zh, en}` 多语言对象 |
| `author` | | object | `{name, email?, url?}` |
| `icon` | | string | 单 emoji 或 `assets/icon.png` 路径 |
| `category` | | enum | 六类之一 |
| `tags` | | string[] | 市场搜索标签 |
| `minAppVersion` | | string | 最低 App 版本要求 |
| `run_as` | | enum | `inline`（默认）或 `subagent`（需要隔离执行） |
| `model` | | enum | 指定模型，`default` = 跟随系统 |
| `allowed_tools` | | string[] | 工具白名单，`[]` = 无工具权限 |
| `permissions.data` | | string[] | 数据访问范围 |
| `permissions.network` | | enum | 网络权限 |
| `permissions.ai` | | object | AI 调用配额 |
| `permissions.storage` | | string | 独立存储上限，如 `1mb` |
| `config` | | object[] | 用户可配置项（JSON Schema 风格） |
| `hooks` | | object | 生命周期钩子，值为 `SKILL.md#section` 或 `null` |
| `pricing` | | object | 定价信息 |
| `mcp` | | object | MCP 生态映射（自动生成，可覆盖） |
| `openai` | | object | OpenAI GPT 生态映射（自动生成，可覆盖） |

---

## 3. 与主流生态的互操作

### 3.1 导出为 MCP Tool

从 `SKILL.md` 自动生成 MCP `tools/list` 响应：

```json
{
  "name": "meal-classifier.classify_food_delivery",
  "description": "自动识别外卖平台账单，精准分类到具体菜系。触发条件：新账单创建时，商户名匹配外卖平台。",
  "inputSchema": {
    "type": "object",
    "properties": {
      "action": {
        "type": "string",
        "enum": ["install", "uninstall", "run", "configure"]
      },
      "config": {
        "type": "object",
        "properties": {
          "preferred_cuisine": {
            "type": "string",
            "enum": ["auto", "chinese", "western"],
            "default": "auto"
          },
          "auto_tag": {
            "type": "boolean",
            "default": true
          }
        }
      }
    },
    "required": ["action"]
  }
}
```

### 3.2 导出为 OpenAI GPT Action

```yaml
# 自动生成
openai:
  action:
    type: "function"
    function:
      name: "classifyFoodDelivery"
      description: "自动识别外卖平台账单，精准分类到具体菜系"
      parameters:
        type: "object"
        properties:
          platform:
            type: "string"
            description: "外卖平台名"
          raw_description:
            type: "string"
            description: "账单原始描述"
```

### 3.3 导出为 Cursor Rule

```markdown
---
# .cursor/rules/meal-classifier.md
description: "外卖账单精准分类规则"
globs: "**/bills/**"
alwaysApply: false
---

# 外卖分类规则

当处理账单数据时：
1. 检测商户名是否匹配外卖平台关键词
2. 从描述中提取菜系信息
3. 自动设置分类为"餐饮"+"具体菜系"
```

---

## 4. Skill 生命周期

### 4.1 状态机

```
  ┌─────────┐     install    ┌──────────┐
  │  未安装  │──────────────→│  已安装    │
  └─────────┘               │  (禁用)   │
                            └─────┬────┘
                                  │ enable
                                  ▼
                            ┌──────────┐
                      ┌─────│  已启用   │─────┐
                      │     └──────────┘     │
                      │ disable               │ upgrade
                      ▼                      ▼
                ┌──────────┐          ┌──────────┐
                │  已安装   │          │ 升级中…  │
                │  (禁用)   │          └─────┬────┘
                └─────┬────┘                │
                      │ uninstall   ┌───────┴───────┐
                      ▼             ▼               ▼
                ┌──────────┐  ┌──────────┐   ┌──────────┐
                │  未安装   │  │  已启用   │   │ 回滚到旧版│
                └──────────┘  └──────────┘   └──────────┘
```

### 4.2 钩子实现模式

钩子实现在 `SKILL.md` 的对应 `##` 节中，为 Markdown + 内嵌代码块：

```markdown
## on-install

初始化流程：

1. 创建独立存储命名空间
2. 加载外卖平台关键词表
3. 注册 `bill.created` 事件监听

```js
// 内嵌实现（可选，也可用 allowed_tools 声明式完成）
export async function onInstall(ctx) {
  await ctx.storage.set('platforms', ['美团', '饿了么', 'DoorDash']);
  await ctx.events.subscribe('bill.created', handleBillCreated);
  ctx.logger.info('meal-classifier installed');
}
```
```

---

## 5. 权限模型

### 5.1 安全边界

| 约束 | 值 | 说明 |
|------|-----|------|
| 最大工具权限 | 1 级 (Write) | Skill 不得调用 delete/clear 等 2 级操作 |
| AI 调用频率 | ≤ 200 Token/次, ≤ 2000 Token/天 | 在 frontmatter 中声明 |
| 网络权限 | 默认 `none` | 需声明 + 用户授权 |
| 文件系统 | 禁止直接访问 | 通过 `storage` 接口间接使用 |
| 独立存储 | 默认 1MB | 在 frontmatter 中可声明更大值 |
| 超时终止 | 5s | 单次钩子执行超过则终止 |
| 递归深度 | ≤ 10 层 | 防止无限循环 |

### 5.2 数据隔离

```
App 数据库
├── bills
│   ├── source="manual"       ← 用户/系统
│   ├── source="skill:{name}" ← Skill 创建
├── rules
│   ├── source="user_taught"
│   └── source="skill:{name}"
├── skill_storage/
│   ├── {name}/               ← 每个 Skill 独立目录
│   │   └── data.json         ← 最大 1MB (默认)
```

---

## 6. 目录结构

### 6.1 单文件 Skill（推荐）

```
skills/
└── meal-classifier/
    └── SKILL.md              ← 单文件，元数据 + 指令合一
```

### 6.2 复杂 Skill（需要静态资源时）

```
skills/
└── meal-classifier/
    ├── SKILL.md              ← 清单 + 指令
    ├── assets/
    │   ├── icon.png          ← 128×128
    │   └── preview.png       ← 市场预览图 920×430
    ├── tests/
    │   └── classify.test.js  ← 单元测试
    └── README.md             ← 人类阅读说明（可选，优先看 SKILL.md）
```

---

## 7. Skill 市场规范

### 7.1 上架审核清单

| 检查项 | 要求 |
|--------|------|
| frontmatter 完整性 | 必填字段齐全 |
| name 唯一性 | 不与已有 Skill 冲突 |
| version 格式 | 严格符合 semver |
| description 有效 | 准确描述功能，不夸大 |
| 权限合理性 | 声明的权限与功能匹配，不过度索权 |
| allowed_tools 必要性 | 每个工具都有明确使用场景 |
| 无恶意代码 | 内嵌 JS 不含 eval / 网络外传 / 文件读写 |
| 隐私合规 | 不收集用户数据上传第三方 |
| 有 on_uninstall 清理 | 卸载时清理所有 Skill 产生的数据 |
| icon 规范 | emoji 或 128×128 PNG |

### 7.2 版本管理

```
MAJOR.MINOR.PATCH

升级策略:
  PATCH (1.0.0 → 1.0.1): 静默自动升级
  MINOR (1.0.0 → 1.1.0): 通知用户，可选升级
  MAJOR (1.0.0 → 2.0.0): 用户确认后升级，保留旧版 30 天回滚期
```

### 7.3 评分与评价

```typescript
interface SkillRating {
  skill_name: string;
  version: string;
  user_id: string;
  rating: 1 | 2 | 3 | 4 | 5;
  review?: string;
  timestamp: string; // ISO 8601
}
```

### 7.4 市场 API

```typescript
interface SkillMarketAPI {
  search(q: string, category?: string, tags?: string[]): Promise<SkillSummary[]>;
  getDetail(name: string): Promise<SkillDetail>;
  
  install(name: string, version?: string): Promise<void>;
  uninstall(name: string): Promise<void>;
  update(name: string, version?: string): Promise<void>;
  
  listInstalled(): Promise<InstalledSkill[]>;
  checkUpdates(): Promise<UpdateInfo[]>;
}
```

---

## 8. Skill 类型与模板

### 8.1 分类增强型

```markdown
---
name: {domain}-classifier
version: 1.0.0
description: {zh: "...", en: "..."}
category: classification
allowed_tools: [rules.add_rule, rules.match_bill, bills.add_tags_to_bill]
permissions:
  data: [bills.read, rules.write]
hooks:
  on_bill_create: "SKILL.md#on-bill-create"
---

# {名称}

## 触发条件
- 事件：`bill.created`
- 条件：商户名匹配 {关键词列表}

## on-bill-create
1. 匹配关键词 → 确定一级分类
2. 描述分析 → 确定二级分类
3. 调用 `rules.add_rule` 沉淀规则
4. 调用 `bills.add_tags_to_bill` 打标签
```

### 8.2 分析扩展型

```markdown
---
name: {name}-analyzer
version: 1.0.0
description: {zh: "...", en: "..."}
category: analysis
allowed_tools: [get_aggregation, generate_chart_config]
permissions:
  data: [bills.read]
  ai: { enabled: true, max_tokens_per_call: 400 }
---

# {名称}

## 触发条件
- 用户请求特定分析（关键词匹配）
- 或定时推送（周报/月报）

## 分析流程
1. 调用 `get_aggregation` 获取数据
2. AI 辅助解读趋势
3. 调用 `generate_chart_config` 生成图表
```

### 8.3 集成连接型

```markdown
---
name: {platform}-importer
version: 1.0.0
description: {zh: "从{平台}导入账单", en: "Import bills from {platform}"}
category: integration
allowed_tools: [parse_tabular_file, apply_column_mapping, import_bills_batch]
permissions:
  data: [bills.write, rules.read]
  network: required
---

# {平台}账单导入

## 触发条件
- 用户上传 {平台} 导出的 CSV/Excel 文件

## 导入流程
1. 识别文件格式（{平台}特定列结构）
2. 调用 `parse_tabular_file` 解析
3. 调用 `apply_column_mapping` 映射
4. 调用 `import_bills_batch` 批量导入
```

---

## 9. 验收清单

- [ ] 使用 `SKILL.md` 单文件格式（非旧的 skill.yaml）
- [ ] frontmatter 必填字段完整（name / version / description）
- [ ] `name` 唯一，符合命名规范
- [ ] `version` 符合 semver
- [ ] `allowed_tools` 仅声明实际使用的工具
- [ ] 权限级别 ≤ 1 级
- [ ] `on_uninstall` 正确清理数据
- [ ] 正文 Markdown 格式正确，人机共读
- [ ] 可在 MCP / OpenAI / Cursor 生态中正确映射
- [ ] 在市场页面正确展示
- [ ] 升级兼容旧版本数据
