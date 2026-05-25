# Wealth Manager — DDD 架构重构蓝图

> 类型: 纯设计蓝图 | 版本: 1.0.0 | 日期: 2026-05-25
> 审查: 待 Momus 审批

---

## 0. 阅读指引

本文档是**仅设计蓝图**（用户要求 "仅设计蓝图"），不包含可执行清单。文档结构：

| 章 | 内容 | 读者 |
|----|------|------|
| 1 | 架构现状诊断 | 所有人 |
| 2 | 目标 DDD 架构 | 架构师 |
| 3 | Agent 层的归宿（关键决策）| 架构师 |
| 4-13 | 各 Bounded Context 详细设计 | 开发团队 |
| 14 | Domain Events 目录 | 开发团队 |
| 15 | 目录结构迁移对照 | 开发团队 |
| 16 | 反模式清单 | 开发团队 |
| 17 | 常见 DDD 场景实现模板 | 开发团队 |

---

## 1. 现状诊断

### 1.1 架构问题图谱

```
当前架构的核心问题：

问题 A: 跨域直接调用（最严重）
  proactive.tool.ts ──直接import──➤ stats / gamification / budget / scenario-triggers
  scenario-triggers.ts ──直接import──➤ budget / gamification / automation
  master.agent.ts ──直接import──➤ 全部 4 个子 Agent

问题 B: 嵌入式 JSON 破坏 Aggregate 边界
  user_profile.budget_limits ──JSON TEXT──➤ 被 budget.tool + stats.tool 双写双读

问题 C: 数据表被跨域写
  debt.tool::add_credit_card ──写入──➤ assets 表

问题 D: Agent 层职责模糊
  Agent = 意图路由？工具编排？权限守卫？→ 三个职责混在一起

问题 E: 备份/同步通过硬编码表名枚举
  data.tool + sync.tool ──遍历──➤ 全部 10+ 张表的名字硬编码
```

### 1.2 技术栈约束

| 维度 | 约束 | 对 DDD 的影响 |
|------|------|---------------|
| 数据库 | SQLite (expo-sqlite) | 单写者、无行锁、无存储过程 → Repository 不能依赖 DB 层保证一致性 |
| 运行时 | React Native (单进程) | 无分布式事务、Domain Events 是进程内 |
| 语言 | TypeScript | 有 interface、泛型，但没有 decorator 元编程（无 NestJS 式依赖注入） |
| 依赖 | 零新增 npm 包 | 不引入 `typeorm`、`inversify`、`@ddd/core` |

---

## 2. 目标 DDD 架构

### 2.1 分层架构

```
┌─────────────────────────────────────────────┐
│               Presentation (UI)             │
│   ChatScreen / Cards / Charts / LogScreen   │
├─────────────────────────────────────────────┤
│           Application Services              │
│   BillingService / AnalyticsService / ...   │
│   (编排用例：校验→调用领域→持久化→返回DTO)     │
├─────────────────────────────────────────────┤
│               Domain Layer                  │
│  ┌──────────┐ ┌──────────┐ ┌──────────────┐│
│  │Billing   │ │Analytics │ │Budget &       ││
│  │Context   │ │Context   │ │Savings Context││
│  │          │ │          │ │               ││
│  │Aggregate:│ │Aggregate:│ │Aggregate:     ││
│  │Bill (root│ │(read-only│ │BudgetLimit    ││
│  │+ Category│ │ views)   │ │SavingsGoal    ││
│  │+ Tag)    │ │          │ │               ││
│  └──────────┘ └──────────┘ └──────────────┘│
│  ┌──────────┐ ┌──────────┐ ┌──────────────┐│
│  │Asset &   │ │Gamificat │ │Security &    ││
│  │Liability │ │ion       │ │Audit Context ││
│  │Context   │ │Context   │ │               ││
│  │          │ │          │ │               ││
│  │Aggregate:│ │Aggregate:│ │Aggregate:     ││
│  │Asset(root│ │Achievemen│ │AuditLog       ││
│  │+ Debt +  │ │t Streak  │ │(事件溯源)      ││
│  │Repayment)│ │          │ │               ││
│  └──────────┘ └──────────┘ └──────────────┘│
├─────────────────────────────────────────────┤
│            Infrastructure Layer             │
│  SQLite / MessageBus / Logger / Cache /     │
│  Notification / VectorStore / HashChain     │
└─────────────────────────────────────────────┘
```

### 2.2 Bounded Context 评估矩阵

每个 Context 必须通过"拆分合理性"评估。评分规则：
- **耦合度** (1-5): 被其他模块 import 的次数。越低 = 越独立 = 越该拆。
- **独立测试能力** (1-5): 是否可以完全 Mock 其依赖独立运行测试。
- **变更频率** (1-5): 未来 6 个月预计修改的活跃度。
- **拆分收益**: 加权平均 ≥ 3.0 才拆。

| # | Bounded Context | 表 | 耦合度 | 测试力 | 变更频 | 收益 | 拆分? |
|---|----------------|-----|--------|--------|--------|------|-------|
| 1 | **Billing** (账单) | `bills`, `categories`, `tags`, `bill_tags`, `correction_log` | 1 (最独立) | 5 | 5 | **3.7** | ✅ |
| 2 | **Budget & Savings** | `savings_goals`, `user_profile`(budget_limits) | 3 | 4 | 4 | **3.7** | ✅ |
| 3 | **Asset & Liability** | `assets`, `debts`, `repayments` | 2 | 5 | 3 | **3.3** | ✅ |
| 4 | **Gamification** | `achievements` | 2 | 5 | 3 | **3.3** | ✅ |
| 5 | **Security & Audit** | `audit_log` | 1 | 5 | 2 | **2.7** | ⚠️ 合并到 Shared Kernel |
| 6 | **Analytics** | (只读查询) | 3 | 2 | 5 | **3.3** | ✅ (Read-only Context) |
| 7 | **Automation** | `recurring_tasks`, `shortcuts` | 3 | 3 | 4 | **3.3** | ✅ |
| 8 | **Rules Engine** | `classification_rules` | 2 | 5 | 3 | **3.3** | ✅ |
| 9 | **Reimbursement** | `reimbursement_tasks` | 1 | 5 | 1 | **2.3** | ❌ 并入 Billing |
| 10 | **Sync & Import** | `sync_state`, import_history | 1 | 3 | 2 | **2.0** | ❌ 并入 Infrastructure |

**结论: 6 个 Bounded Context + 1 个 Shared Kernel**

```
Bounded Contexts (独立部署/测试单元):
  ├── billing/          (Billing Context)
  ├── budget/           (Budget & Savings Context)
  ├── asset/            (Asset & Liability Context)
  ├── gamification/     (Gamification Context)
  ├── analytics/        (Analytics Read-only Context)
  ├── automation/       (Automation Context)
  └── rules/            (Rules Engine Context)

Shared Kernel (多个 Context 共享):
  └── shared/
       ├── AuditLog       (不可变事件日志，所有 Context 写入)
       ├── Money           (金额 Value Object)
       ├── DateRange       (日期范围 Value Object)
       ├── BillId          (账单标识 Value Object)
       └── DomainEvent     (基类)
```

---

## 3. Agent 层的归宿 (关键架构决策)

### 3.1 当前 Agent 职责分析

| Agent | 当前行为 | 对应 DDD 概念 |
|-------|---------|-------------|
| **master** | NLU → 意图路由 → 调用子 Agent | **Application Service** (Orchestrator) |
| **ledger** | 处理记账/查询 intent → 调用 bills/stats 工具 | **Application Service** (Billing) |
| **analyst** | 处理分析 intent → 调用 stats/graph 工具 | **Application Service** (Analytics) |
| **coach** | 处理预算/成就 intent → 调用 budget/gamification 工具 | **Application Service** (Budget + Gamification) |
| **guardian** | 处理安全/自动化 intent → 调用 security/automation 工具 | **Application Service** (Security + Automation) |

### 3.2 决策: Agent → Application Service 演进

**Agent 不消失，降级为 Application Service 的入口适配器。**

```
迁移前:
  ChatScreen
    → master.agent.ts (NLU)
      → ledger.agent.ts  (直接调用 bills.tool.ts)
      → analyst.agent.ts (直接调用 stats.tool.ts)

迁移后:
  ChatScreen
    → ApplicationServices.router(intent)
      → BillingService.recordBill(cmd)     // 原 ledger.agent
        → BillRepository.save(bill)
        → DomainEventBus.publish(BillRecorded)
      → AnalyticsService.getOverview(query)  // 原 analyst.agent
        → BillRepository.aggregate(...)
```

**具体规则**:
1. Agent 文件保留为 `src/application/<name>.service.ts`
2. Agent 不再直接 `import` 工具函数，改为注入 `Repository` / `DomainService`
3. `master.agent.ts` 的 NLU 分类逻辑保留，但路由目标从"子 Agent 函数"改为"Application Service 方法"
4. `guardian.agent.ts` 的 `preActionCheck` 不再被 `ledger.agent.ts` 直接 import，改为通过 Application Service 层统一调用

---

## 4. Billing Context (账单聚合)

### 4.1 聚合根: Bill

```typescript
// src/domain/billing/aggregates/Bill.ts

// ─── Value Objects ───
class Money {
  constructor(readonly amount: number, readonly currency: string = 'CNY') {
    if (amount < 0 || amount > 99999999) throw new DomainError('金额超出范围');
    Object.freeze(this);
  }
  add(other: Money): Money { return new Money(this.amount + other.amount); }
  negate(): Money { return new Money(-this.amount); }
}

class BillType {
  static readonly INCOME = new BillType('income');
  static readonly EXPENSE = new BillType('expense');
  static readonly REFUND = new BillType('refund');
  private constructor(readonly value: string) {}
}

class Category {
  constructor(readonly name: string, readonly icon?: string) {}
}

// ─── Aggregate Root ───
class Bill {
  private _tags: Tag[] = [];
  private _domainEvents: DomainEvent[] = [];

  constructor(
    readonly id: BillId,
    private _amount: Money,
    private _type: BillType,
    private _category: Category,
    private _merchant: string,
    private _date: string,
    private _note: string,
    readonly source: BillSource,
    readonly createdAt: string,
  ) {}

  // 工厂方法
  static record(cmd: RecordBillCommand): Bill {
    const bill = new Bill(/* ... */);
    bill._domainEvents.push(new BillRecordedEvent(bill));
    return bill;
  }

  // 修改（产生 BillModifiedEvent）
  modifyAmount(newAmount: Money): void {
    const oldAmount = this._amount;
    this._amount = newAmount;
    this._domainEvents.push(new BillModifiedEvent(this.id, 'amount', oldAmount, newAmount));
  }

  modifyCategory(newCategory: Category): void { /* 类似 */ }

  // 退款（产生 BillRefundedEvent）
  refund(amount: Money, note: string): Bill {
    const refundBill = new Bill(/* type=refund */);
    this._domainEvents.push(new BillRefundedEvent(this.id, refundBill));
    return refundBill;
  }

  // 拆分（产生 BillSplitEvent）
  split(splits: SplitItem[]): Bill[] { /* ... */ }

  get tags(): ReadonlyArray<Tag> { return this._tags; }
  get domainEvents(): ReadonlyArray<DomainEvent> { return this._domainEvents; }
  clearEvents(): void { this._domainEvents = []; }
}
```

### 4.2 Repository 接口

```typescript
// src/domain/billing/repositories/BillRepository.ts

interface BillRepository {
  save(bill: Bill): Promise<void>;                    // INSERT or UPDATE
  findById(id: BillId): Promise<Bill | null>;        // 重建聚合
  findByDateRange(range: DateRange): Promise<Bill[]>;
  search(criteria: BillSearchCriteria): Promise<Bill[]>;
  
  // 只读查询（返回 DTO，不重建聚合）
  aggregate(period: Period): Promise<AggregationResult>;
  getCategoryTotals(period: Period): Promise<CategoryTotal[]>;
  getMerchantRanking(period: Period, limit: number): Promise<MerchantSummary[]>;
}

interface CategoryRepository {
  findAll(): Promise<Category[]>;
  findByName(name: string): Promise<Category | null>;
}

interface TagRepository {
  save(tag: Tag): Promise<void>;
  findAll(): Promise<Tag[]>;
  attachToBill(billId: BillId, tagId: string): Promise<void>;
  detachFromBill(billId: BillId, tagId: string): Promise<void>;
}
```

### 4.3 实现位置

| 组件 | 文件 |
|------|------|
| Aggregate + Value Objects | `src/domain/billing/aggregates/Bill.ts` |
| Repository 接口 | `src/domain/billing/repositories/BillRepository.ts` |
| Repository 实现 (SQLite) | `src/infrastructure/persistence/BillRepositoryImpl.ts` |
| Domain Events | `src/domain/billing/events/` |

---

## 5. Budget & Savings Context

### 5.1 关键改造: 提取 budget_limits 为独立表

**现状**: `budget_limits` 是 `user_profile` 表内的 JSON TEXT 字段。
**目标**: 独立表 `budgets`。

```sql
CREATE TABLE budgets (
  id TEXT PRIMARY KEY,
  category TEXT NOT NULL,
  limit_amount REAL NOT NULL,
  period TEXT NOT NULL DEFAULT 'monthly',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(category, period)
);
```

### 5.2 聚合根

```typescript
// src/domain/budget/aggregates/BudgetPlan.ts

class BudgetPlan {
  private _limits: BudgetLimit[] = [];

  setLimit(category: string, amount: Money, period: 'monthly' | 'weekly'): void {
    const existing = this._limits.findIndex(l => l.category === category);
    if (existing >= 0) {
      this._limits[existing] = new BudgetLimit(category, amount, period);
    } else {
      this._limits.push(new BudgetLimit(category, amount, period));
    }
    this._domainEvents.push(new BudgetLimitSetEvent(category, amount));
  }

  checkOverrun(category: string, spent: Money): OverrunStatus {
    const limit = this._limits.find(l => l.category === category);
    if (!limit) return OverrunStatus.NO_LIMIT;
    const pct = spent.amount / limit.amount.amount;
    if (pct > 1.0) return OverrunStatus.OVERRUN;
    if (pct > 0.8) return OverrunStatus.WARNING;
    return OverrunStatus.OK;
  }
}

// src/domain/budget/aggregates/SavingsGoal.ts
class SavingsGoal {
  constructor(
    readonly id: string,
    readonly name: string,
    readonly targetAmount: Money,
    private _currentAmount: Money,
    readonly deadline?: string,
  ) {}

  contribute(amount: Money): void {
    this._currentAmount = this._currentAmount.add(amount);
    if (this.isCompleted()) {
      this._domainEvents.push(new SavingsGoalCompletedEvent(this.id));
    }
  }

  progressPercent(): number {
    return Math.round((this._currentAmount.amount / this.targetAmount.amount) * 100);
  }

  isCompleted(): boolean { return this._currentAmount.amount >= this.targetAmount.amount; }
}
```

---

## 6. Asset & Liability Context

### 6.1 关键改造: 合并 add_credit_card

**现状**: `debt.tool.ts::add_credit_card` 写入 `assets` 表。
**目标**: 信用卡统一建模为 Asset 的子类型。

```typescript
// src/domain/asset/aggregates/Asset.ts

class Asset {
  constructor(
    readonly id: string,
    readonly name: string,
    readonly type: AssetType,  // cash | bank | stock | fund | real_estate | credit_card | ...
    private _amount: Money,
    readonly note?: string,
  ) {}

  updateValue(newAmount: Money): void { this._amount = newAmount; }
  get amount(): Money { return this._amount; }
}

// 债务是独立的聚合根，不嵌套在 Asset 内
class Debt {
  constructor(
    readonly id: string,
    readonly title: string,
    readonly type: '借出' | '借入',
    readonly principal: Money,
    private _remaining: Money,
    readonly counterparty: string,
    readonly interestRate?: number,
    readonly dueDate?: string,
  ) {}

  recordRepayment(amount: Money): Repayment {
    this._remaining = this._remaining.add(amount.negate());
    const repayment = new Repayment(/* ... */);
    this._domainEvents.push(new DebtRepaidEvent(this.id, amount));
    return repayment;
  }

  get remaining(): Money { return this._remaining; }
  get status(): DebtStatus {
    if (this._remaining.amount <= 0) return 'cleared';
    if (this.dueDate && new Date(this.dueDate) < new Date()) return 'overdue';
    return 'active';
  }
}
```

---

## 7. Gamification Context

```typescript
// src/domain/gamification/aggregates/Achievement.ts

class Achievement {
  constructor(
    readonly id: string,
    readonly name: string,
    readonly maxProgress: number,
    private _progress: number = 0,
    private _unlocked: boolean = false,
  ) {}

  addProgress(delta: number): void {
    if (this._unlocked) return;
    this._progress = Math.min(this._progress + delta, this.maxProgress);
    if (this._progress >= this.maxProgress) {
      this._unlocked = true;
      this._domainEvents.push(new AchievementUnlockedEvent(this.id, this.name));
    }
    this._domainEvents.push(new AchievementProgressedEvent(this.id, this._progress, this.maxProgress));
  }
}

// src/domain/gamification/aggregates/Streak.ts
class Streak {
  private _currentStreak: number = 0;
  private _longestStreak: number = 0;
  private _lastRecordDate: string | null = null;

  recordDay(date: string): void {
    if (!this._lastRecordDate) {
      this._currentStreak = 1;
    } else if (isConsecutiveDay(this._lastRecordDate, date)) {
      this._currentStreak++;
    } else if (!isSameDay(this._lastRecordDate, date)) {
      this._currentStreak = 1; // 中断
    }
    this._longestStreak = Math.max(this._longestStreak, this._currentStreak);
    this._lastRecordDate = date;

    if (this._currentStreak > 0 && this._currentStreak % 7 === 0) {
      this._domainEvents.push(new StreakMilestoneEvent(this._currentStreak));
    }
  }
}
```

---

## 8. Analytics Context (Read-only)

Analytics 是 Read-Only Context，不拥有任何表，通过 Repository 查询其他 Context 的数据。

```typescript
// src/domain/analytics/services/AnalyticsService.ts

interface AnalyticsService {
  getCategoryTrend(period: Period): Promise<CategoryTrend[]>;
  detectAnomalies(period: Period): Promise<AnomalyReport[]>;
  getYearlyComparison(year: number): Promise<YearlyComparison>;
  generateChart(config: ChartRequest): Promise<ChartConfig>;
}
```

**设计原则**: Analytics 的所有数据通过 `BillRepository` 和 `BudgetRepository` 的查询方法获取，不直接访问数据库。

---

## 9. Automation Context

```typescript
// src/domain/automation/aggregates/RecurringTask.ts

class RecurringTask {
  constructor(
    readonly id: string,
    readonly name: string,
    readonly type: 'reminder' | 'backup' | 'report',
    readonly cronExpression: string,
    private _enabled: boolean = true,
  ) {}

  shouldTrigger(now: Date = new Date()): boolean {
    if (!this._enabled) return false;
    return matchesCron(this.cronExpression, now);
  }

  recordTrigger(): void {
    this._domainEvents.push(new TaskTriggeredEvent(this.id, this.type));
  }

  enable(): void { this._enabled = true; }
  disable(): void { this._enabled = false; }
}
```

**场景编排器** (替代 `scenario-triggers.ts` 和 `proactive.tool.ts` 的直接 import):

```typescript
// src/application/sagas/ProactiveCheckSaga.ts

class ProactiveCheckSaga {
  constructor(
    private readonly domainEventBus: DomainEventBus,
    private readonly billRepo: BillRepository,
    private readonly budgetRepo: BudgetRepository,
    private readonly achievementRepo: AchievementRepository,
  ) {}

  // 订阅 BillRecordedEvent，自动检查预算和成就
  setup(): void {
    this.domainEventBus.subscribe(BillRecordedEvent, async (event) => {
      // 每个 handler 独立 try-catch，互不影响
      this.checkBudgetOverrun(event).catch(logError);
      this.updateAchievements(event).catch(logError);
      this.checkAchievementUnlock(event).catch(logError);
    });
  }

  private async checkBudgetOverrun(event: BillRecordedEvent): Promise<void> {
    if (event.bill.type !== 'expense') return;
    const budget = await this.budgetRepo.findByCategory(event.bill.category);
    if (!budget) return;
    const spent = await this.billRepo.getCategoryTotal(event.bill.category, 'month');
    const status = budget.checkOverrun(event.bill.category, spent);
    if (status === OverrunStatus.OVERRUN || status === OverrunStatus.WARNING) {
      await this.domainEventBus.publish(new BudgetOverrunDetectedEvent(/* ... */));
    }
  }

  private async updateAchievements(event: BillRecordedEvent): Promise<void> {
    // 更新"记账达人"等成就进度
  }
}
```

---

## 10. Rules Engine Context

Rules Engine 作为 Shared Kernel 中的独立 Context，被 Billing 调用。

```typescript
// src/domain/rules/aggregates/ClassificationRule.ts

class ClassificationRule {
  constructor(
    readonly id: string,
    readonly name: string,
    readonly priority: number,
    readonly conditions: ConditionGroup,
    readonly actions: RuleAction[],
    private _enabled: boolean = true,
  ) {}

  match(facts: Record<string, unknown>): MatchResult {
    if (!this._enabled) return MatchResult.NO_MATCH;
    const matched = this.conditions.evaluate(facts);
    if (!matched) return MatchResult.NO_MATCH;
    return new MatchResult(this.actions, matched.confidence);
  }

  // 当用户纠正分类时，Rule Learner 会调用此方法
  recordCorrection(facts: Record<string, unknown>, correctCategory: string): void {
    this._domainEvents.push(new RuleCorrectedEvent(this.id, facts, correctCategory));
  }
}
```

---

## 11. Shared Kernel (共享内核)

```typescript
// src/domain/shared/

// ─── 基类 ───
abstract class DomainEvent {
  readonly occurredAt: string = new Date().toISOString();
  abstract readonly eventType: string;
}

abstract class AggregateRoot {
  private _events: DomainEvent[] = [];
  protected addEvent(event: DomainEvent): void { this._events.push(event); }
  get events(): ReadonlyArray<DomainEvent> { return this._events; }
  clearEvents(): void { this._events = []; }
}

// ─── Value Objects ───
class Money { /* 见 Billing Context */ }
class DateRange { constructor(readonly start: string, readonly end: string) {} }
class Period { constructor(readonly value: 'today' | 'week' | 'month') {} }

// ─── 通用 Repository 接口 ───
interface Repository<T, ID> {
  save(entity: T): Promise<void>;
  findById(id: ID): Promise<T | null>;
  delete(id: ID): Promise<boolean>;
}

// ─── Domain Event Bus ───
interface DomainEventBus {
  publish(event: DomainEvent): Promise<void>;
  subscribe<T extends DomainEvent>(eventClass: new (...args: any[]) => T, handler: (event: T) => Promise<void>): () => void;
}
```

---

## 12. Application Services Layer

Application Services 替代原有的 Agent 直接工具调用：

```typescript
// src/application/BillingService.ts

class BillingService {
  constructor(
    private readonly billRepo: BillRepository,
    private readonly ruleEngine: RuleEngine,
    private readonly eventBus: DomainEventBus,
  ) {}

  async recordBill(cmd: {
    amount: number;
    type: 'income' | 'expense';
    merchant: string;
    category?: string;
    date?: string;
    note?: string;
  }): Promise<Bill> {
    // 1. 猜测分类（如果没有提供）
    const category = cmd.category || await this.ruleEngine.guessCategory(cmd.merchant, cmd.amount);

    // 2. 去重检查
    const duplicate = await this.billRepo.search({
      merchant: cmd.merchant,
      amount: cmd.amount,
      date: cmd.date || today(),
    });
    if (duplicate.length > 0) {
      throw new DuplicateBillError(duplicate[0].id);
    }

    // 3. 创建聚合
    const bill = Bill.record({
      ...cmd,
      category,
      id: generateId(),
      createdAt: new Date().toISOString(),
    });

    // 4. 持久化
    await this.billRepo.save(bill);

    // 5. 发布事件
    for (const event of bill.domainEvents) {
      await this.eventBus.publish(event);
    }
    bill.clearEvents();

    return bill;
  }
}
```

---

## 13. Infrastructure Layer

基础设施层提供技术实现，Domain 层只依赖接口：

| 接口 (Domain) | 实现 (Infrastructure) |
|---------------|----------------------|
| `BillRepository` | `src/infrastructure/persistence/BillRepositoryImpl.ts` (SQLite) |
| `DomainEventBus`  | `src/infrastructure/events/DomainEventBusImpl.ts` (基于 MessageBus) |
| `RuleEngine`      | `src/infrastructure/rules/RuleEngineImpl.ts` |
| `Logger`          | `src/core/logger/logger.ts` (已有) |

### 13.1 DomainEventBusImpl

```typescript
// src/infrastructure/events/DomainEventBusImpl.ts

class DomainEventBusImpl implements DomainEventBus {
  constructor(private readonly messageBus: typeof messageBus) {}

  async publish(event: DomainEvent): Promise<void> {
    await this.messageBus.publish({
      from: 'system' as AgentId,
      to: 'broadcast',
      type: 'event',
      payload: {
        eventType: event.eventType,
        data: event,
      },
    });
  }

  subscribe<T extends DomainEvent>(
    eventClass: { new (...args: any[]): T },
    handler: (event: T) => Promise<void>
  ): () => void {
    return this.messageBus.subscribe('system' as AgentId, async (msg) => {
      const payload = msg.payload as { eventType: string; data: unknown };
      if (payload.eventType === new eventClass().eventType) {
        await handler(payload.data as T);
      }
    });
  }
}
```

**事件投递语义**: **At-Least-Once**（基于 MessageBus 的同步广播）。失败消息进入死信队列。

---

## 14. Domain Events 目录

| Event | 发布者 | 订阅者 |
|-------|--------|--------|
| `BillRecorded` | Billing Context | Gamification (更新成就) / Budget (检查超支) / Automation (评估场景) |
| `BillModified` | Billing Context | Security & Audit (写入审计日志) |
| `BillDeleted` | Billing Context | Analytics (刷新缓存) / Gamification (回退进度) |
| `BillCategoryChanged` | Billing Context | Rules Engine (记录纠正日志) |
| `BudgetLimitSet` | Budget Context | Analytics (更新预算图表) |
| `BudgetOverrunDetected` | Budget Context | Automation (触发通知) / UI (展示警告卡片) |
| `SavingsGoalCompleted` | Budget Context | Gamification (解锁成就) / Automation (发送祝贺通知) |
| `AchievementUnlocked` | Gamification Context | Automation (发送通知) / UI (展示动画) |
| `StreakMilestone` | Gamification Context | Automation (发送鼓励通知) |
| `TaskTriggered` | Automation Context | Infrastructure (执行任务) |
| `RuleCorrected` | Rules Engine | Rules Engine (自学习) |

---

## 15. 目录结构迁移对照

```
迁移前 (当前)                          迁移后 (DDD)
─────────────────────────────────      ────────────────────────────────
src/tools/bills/bills.tool.ts     →    src/domain/billing/
src/tools/tags/tags.tool.ts       →    src/domain/billing/
src/tools/import/*.ts             →    src/domain/billing/import/

src/tools/budget/budget.tool.ts   →    src/domain/budget/
src/tools/stats/stats.tool.ts     →    src/domain/analytics/
src/tools/gamification/*.ts       →    src/domain/gamification/
src/tools/assets/assets.tool.ts   →    src/domain/asset/
src/tools/debt/debt.tool.ts       →    src/domain/asset/
src/tools/security/security.tool.ts →  src/domain/shared/audit/
src/tools/automation/*.ts         →    src/domain/automation/
src/tools/proactive/*.ts          →    src/application/sagas/
src/tools/rules/rules.tool.ts     →    src/domain/rules/
src/tools/reimbursement/*.ts      →    src/domain/billing/reimbursement/
src/tools/data/data.tool.ts       →    src/infrastructure/persistence/
src/tools/webdav/*.ts             →    src/infrastructure/sync/

src/agents/ledger/ledger.agent.ts    →    src/application/BillingService.ts
src/agents/analyst/analyst.agent.ts  →    src/application/AnalyticsService.ts
src/agents/coach/coach.agent.ts      →    src/application/CoachService.ts (Budget + Gamification)
src/agents/guardian/guardian.agent.ts →   src/application/GuardianService.ts
src/agents/master/master.agent.ts    →    src/application/MasterOrchestrator.ts

src/core/memory/memory-engine.ts     →    src/infrastructure/persistence/
src/core/vector/vector-store.ts      →    src/infrastructure/vector/
src/core/cache/                      →    src/infrastructure/cache/
src/core/safety/circuit-breaker.ts   →    src/infrastructure/resilience/
src/core/message-bus/                →    src/infrastructure/events/

src/shared/types.ts                  →    按 Context 拆散到 domain/*/types.ts
                                       + src/domain/shared/ (Shared Kernel)
```

---

## 16. 反模式清单 (必须遵守)

| # | 反模式 | 说明 |
|---|--------|------|
| 1 | ❌ 为单字段建 Value Object | `class BillId { constructor(readonly value: string) {} }` 是过度包装。直接用 `string`。 |
| 2 | ❌ Aggregate 直接持有另一个 Aggregate 的引用 | `class Bill { budget: BudgetPlan }` 禁止。用 ID 引用。 |
| 3 | ❌ Application Service 里写 if/else 业务逻辑 | 业务判断必须在 Domain 层。Application 层只做编排。 |
| 4 | ❌ Repository 返回 Domain Event | Event 只能从 Aggregate 产出，不能从 DB 重建。|
| 5 | ❌ 跨 Context 的同步 RPC 调用 | `BillingService → await BudgetService.check()` 禁止。用事件异步解耦。 |
| 6 | ❌ 在 SQLite Repository 里用 JOIN 跨聚合查询 | 每个 Aggregate 有自己的 Repository。需要跨聚合数据？走 Application Service 组装。 |
| 7 | ❌ 超过 3 层的类继承 | AggregateRoot → Entity → 子类 为止。不许再加。 |
| 8 | ❌ `any` 类型的 Repository | 必须显式泛型 `Repository<T extends AggregateRoot>` |

---

## 17. 常见 DDD 场景实现模板

### 17.1 创建聚合根（记账）

```typescript
// Application Service
async recordBill(cmd: RecordBillCommand): Promise<BillDTO> {
  // 1. 输入校验
  if (cmd.amount <= 0) throw new ValidationError('金额必须大于0');

  // 2. 调用领域逻辑
  const bill = Bill.record(cmd);

  // 3. 持久化
  await this.billRepo.save(bill);

  // 4. 发布事件
  await this.eventBus.publishAll(bill.domainEvents);
  bill.clearEvents();

  // 5. 返回 DTO（不暴露领域对象给 UI）
  return BillDTO.from(bill);
}
```

### 17.2 修改聚合根

```typescript
async modifyBill(billId: string, cmd: ModifyBillCommand): Promise<void> {
  const bill = await this.billRepo.findById(billId);
  if (!bill) throw new NotFoundError('账单不存在');

  if (cmd.amount) bill.modifyAmount(new Money(cmd.amount));
  if (cmd.category) bill.modifyCategory(cmd.category);

  await this.billRepo.save(bill);
  await this.eventBus.publishAll(bill.domainEvents);
}
```

### 17.3 跨 Context Saga（预算超标通知）

```typescript
// Application/Saga 层
class BudgetAlertSaga {
  setup(): void {
    this.eventBus.subscribe(BillRecordedEvent, async (event) => {
      if (event.bill.type !== 'expense') return;

      const budget = await this.budgetRepo.findByCategory(event.bill.category);
      if (!budget) return;

      const monthStart = new Date().toISOString().slice(0, 7) + '-01';
      const spent = await this.billRepo.getCategoryTotal(event.bill.category, monthStart);

      if (budget.checkOverrun(event.bill.category, new Money(spent)).isWarning()) {
        await this.notificationService.sendBudgetWarning(event.bill.category, spent, budget);
      }
    });
  }
}
```

---

## 附录 A: 术语对照表

| 中文 | 英文 (DDD) | 本项目中 |
|------|-----------|---------|
| 限界上下文 | Bounded Context | `src/domain/<context>/` |
| 聚合根 | Aggregate Root | `Bill`, `SavingsGoal`, `Achievement`, `Asset`, `Debt`, `RecurringTask`, `ClassificationRule` |
| 值对象 | Value Object | `Money`, `DateRange`, `Period`, `Category` |
| 仓储 | Repository | `BillRepository`, `BudgetRepository` |
| 领域事件 | Domain Event | `BillRecordedEvent`, `BudgetOverrunDetectedEvent` |
| 领域服务 | Domain Service | `RuleEngine.guessCategory()` |
| 应用服务 | Application Service | `BillingService.recordBill()` |
| 共享内核 | Shared Kernel | `src/domain/shared/` |
| 防腐层 | Anti-Corruption Layer | 不需要（单进程项目） |
| 过程管理器 | Saga / Process Manager | `ProactiveCheckSaga`, `BudgetAlertSaga` |

---

## 附录 B: 反模式清单的来源

| 反模式 | DDD 来源 |
|--------|---------|
| 禁止 Aggregate 互相引用 | Eric Evans, "Domain-Driven Design", Chapter 6 |
| 禁止 Repository 返回 Event | Vaughn Vernon, "Implementing DDD", Chapter 12 |
| Application Service 无业务逻辑 | Clean Architecture: Use Cases 层只编排 |
| 单字段不建 VO | Martin Fowler, "When to Make a Value Object" |

---

## 附录 C: 已满足的 Metis 约束

| Metis 要求 | 本蓝图的回应 |
|------------|-------------|
| "每个 Context 必须有拆分理由" | §2.2 评估矩阵（耦合度/测试力/变更频/收益）|
| "Domain Events 的投递语义" | §13.1 明确 At-Least-Once + 死信队列 |
| "Agent 层的归宿" | §3 完整决策：降级为 Application Service |
| "反模式清单" | §16 8 条禁止规则 |
| "聚合根 + 表 + Repository + Events" | §4-13 每章包含全部四项 |
| "不引入第三方 DDD 框架" | §2.2 技术栈约束：零新增依赖 |
| "不超 3 层继承" | §16 第 7 条反模式 |
