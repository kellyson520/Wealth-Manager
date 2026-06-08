# Wealth-Manager 架构优化方案

> 分析时间: 2026-06-06
> 项目版本: v0.1.0
> 技术栈: Expo 52 + React Native 0.76 + TypeScript 5.3 + SQLite

---

## 📊 项目概况

| 指标 | 数值 |
|------|------|
| TypeScript 文件 | 157 |
| 总代码行数 | 29,150 |
| Agent 数量 | 5 (master/ledger/analyst/coach/guardian) |
| 工具数量 | 16 |
| 测试文件 | 22 |
| DDD 领域模块 | 6 (asset/billing/budget/automation/gamification/rules) |

---

## 🏗️ 架构分析

### 当前架构

```
用户输入 → Master Agent (NLU 意图识别)
                ↓
    ┌──────────┼──────────┬──────────┐
    ↓          ↓          ↓          ↓
  Ledger    Analyst    Coach    Guardian
  (记账)    (分析)    (教练)    (安全)
    ↓          ↓          ↓          ↓
    └──────────┼──────────┴──────────┘
               ↓
        Tool Executor (统一执行管线)
        - 权限检查
        - 审计日志
        - 超时控制
               ↓
        Domain Layer (DDD 聚合根)
               ↓
        SQLite Database
```

### 优势 ✅
1. **Agent 分工清晰** — 5 个 Agent 各司其职，职责边界明确
2. **统一执行管线** — `tool-executor.ts` 提供了权限、审计、超时的统一管控
3. **DDD 领域模型** — 有聚合根、仓储接口、领域事件，架构意识强
4. **安全意识** — 有 circuit breaker、token budget、sanitizer 等安全组件
5. **记忆系统** — 分层记忆（episodic/longterm/semantic）+ 混合检索

### 问题 ❌

#### 致命级 (2)
1. **数据库加密无效** — `PRAGMA key` 只在 SQLCipher 下生效，当前用的是普通 `expo-sqlite`，且默认密钥硬编码
2. **WebDAV 同步无签名验证** — 远端备份可静默篡改本地数据

#### 严重级 (5)
3. **Agent 绕过执行管线** — Ledger 直接调用工具，绕过权限/审计
4. **工具参数无 schema 校验** — NaN/Infinity/非法值可直接入库
5. **哈希链可被重算** — 不用 HMAC，攻击者可篡改后重算全链
6. **多步写入无事务** — 资产转账/债务还款中途失败导致数据不一致
7. **WebDAV 密码加密密钥可预测** — 基于代码可见值派生

#### 中等级 (4)
8. **导出接口泄露完整数据给 LLM 上下文**
9. **CSV 公式注入** — `= + - @` 开头的单元格未转义
10. **云端 baseUrl 可绕过安全策略**
11. **限流逻辑设计错误** — 日期变化导致每日重置

---

## 🔧 优化方案

### Phase 1: 安全加固 (1-2 周)

#### 1.1 数据库真实加密
```typescript
// 替换当前方案
import * as SQLite from 'expo-sqlite';
import * as SecureStore from 'expo-secure-store';
import * as Crypto from 'expo-crypto';

async function getOrCreateDbKey(): Promise<string> {
  const keyName = 'wm_db_key_v1';
  let key = await SecureStore.getItemAsync(keyName);
  if (!key) {
    key = Crypto.randomUUID(); // 256-bit 随机密钥
    await SecureStore.setItemAsync(keyName, key, {
      keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK
    });
  }
  return key;
}
```

#### 1.2 工具参数 Schema 校验
```typescript
// 在 tool-executor.ts 中添加
function validateParams(entry: ToolEntry, params: Record<string, unknown>): void {
  const schema = entry.definition.parameters;
  for (const [key, def] of Object.entries(schema.properties || {})) {
    const value = params[key];
    if (def.type === 'number') {
      if (typeof value !== 'number' || !Number.isFinite(value)) {
        throw new Error(`${key} must be a finite number`);
      }
      if (def.minimum !== undefined && value < def.minimum) {
        throw new Error(`${key} must be >= ${def.minimum}`);
      }
      if (def.maximum !== undefined && value > def.maximum) {
        throw new Error(`${key} must be <= ${def.maximum}`);
      }
    }
    if (def.type === 'string' && def.maxLength && typeof value === 'string') {
      if (value.length > def.maxLength) {
        throw new Error(`${key} must be <= ${def.maxLength} chars`);
      }
    }
  }
}
```

#### 1.3 哈希链改 HMAC
```typescript
import { hmac } from '@noble/hashes/hmac';
import { sha256 } from '@noble/hashes/sha256';

function computeBillHash(bill: Bill, prevHash: string, secret: Uint8Array): string {
  const canonical = JSON.stringify({
    id: bill.id, amount: bill.amount, type: bill.type,
    category: bill.category, merchant: bill.merchant,
    note: bill.note, tags: bill.tags, date: bill.date,
    source: bill.source, created_at: bill.created_at,
    prevHash,
  });
  const mac = hmac(sha256, secret, new TextEncoder().encode(canonical));
  return Buffer.from(mac).toString('hex');
}
```

### Phase 2: 数据一致性 (1 周)

#### 2.1 事务包装器
```typescript
// 所有多步写入必须使用事务
export async function withTransaction<T>(
  db: SQLiteDatabase,
  fn: () => Promise<T>
): Promise<T> {
  await db.execAsync('BEGIN IMMEDIATE');
  try {
    const result = await fn();
    await db.execAsync('COMMIT');
    return result;
  } catch (e) {
    await db.execAsync('ROLLBACK');
    throw e;
  }
}

// 使用示例：资产转账
async function transferAsset(fromId: string, toId: string, amount: number) {
  const db = await getDatabase();
  return withTransaction(db, async () => {
    await db.runAsync('UPDATE assets SET amount = amount - ? WHERE id = ?', [amount, fromId]);
    await db.runAsync('UPDATE assets SET amount = amount + ? WHERE id = ?', [amount, toId]);
    await db.runAsync('INSERT INTO audit_log ...');
  });
}
```

#### 2.2 WebDAV 同步签名
```typescript
interface SyncPackage {
  version: number;
  timestamp: number;
  checksum: string; // HMAC-SHA256 of payload
  payload: {
    bills: Bill[];
    assets: Asset[];
    debts: Debt[];
  };
}

async function verifySyncPackage(pkg: SyncPackage, secret: Uint8Array): Promise<boolean> {
  const expectedHmac = hmac(sha256, secret, 
    new TextEncoder().encode(JSON.stringify(pkg.payload))
  );
  return Buffer.from(expectedHmac).toString('hex') === pkg.checksum;
}
```

### Phase 3: 架构改进 (2 周)

#### 3.1 Agent 执行管线强制收口
```typescript
// 禁止 Agent 直接 import 工具
// 所有工具调用必须通过 executeTool

// 在 master.agent.ts 中
async function dispatchToAgent(agentId: AgentId, intent: IntentResult) {
  const tools = listToolsForAgent(agentId);
  const toolName = mapIntentToTool(intent);
  const entry = getTool(toolName);
  if (!entry) throw new Error(`Tool ${toolName} not available for ${agentId}`);
  
  return executeTool(entry, intent.params, {
    agentId,
    userConfirmed: requiresConfirmation(entry),
  });
}
```

#### 3.2 记忆系统 PII Gate
```typescript
// 在 embedding 之前添加 PII 过滤
async function safeEmbed(text: string): Promise<number[]> {
  const piiResult = detectPII(text);
  if (piiResult.hasPII) {
    // 脱敏后再 embedding
    text = maskPII(text, piiResult.matches);
  }
  return embed(text);
}
```

#### 3.3 规则引擎改进
```typescript
// 添加 schema 校验
interface RuleCondition {
  field: string;
  operator: 'equals' | 'contains' | 'gt' | 'lt' | 'in' | 'regex';
  value: unknown;
}

function validateCondition(cond: RuleCondition): void {
  if (!cond.field || typeof cond.field !== 'string') {
    throw new Error('Invalid condition field');
  }
  if (cond.operator === 'regex') {
    // 禁止 ReDoS
    try { new RegExp(cond.value as string); } catch { throw new Error('Invalid regex'); }
  }
}
```

### Phase 4: 测试补全 (持续)

#### 需要补充的测试覆盖
- [ ] 数据库初始化和迁移
- [ ] 事务回滚场景
- [ ] 哈希链计算和验证
- [ ] 工具执行管线权限检查
- [ ] Agent 间通信
- [ ] 云端 API 调用和错误处理
- [ ] 规则引擎匹配和学习
- [ ] WebDAV 同步签名/验证

---

## 📈 性能优化建议

### 1. 数据库索引
```sql
CREATE INDEX IF NOT EXISTS idx_bills_date ON bills(date);
CREATE INDEX IF NOT EXISTS idx_bills_type ON bills(type);
CREATE INDEX IF NOT EXISTS idx_bills_category ON bills(category);
CREATE INDEX IF NOT EXISTS idx_bills_created_at ON bills(created_at);
```

### 2. 批量操作
```typescript
// 替换单条插入
async function batchInsertBills(bills: Bill[]): Promise<void> {
  const db = await getDatabase();
  await withTransaction(db, async () => {
    const stmt = await db.prepareAsync(
      'INSERT INTO bills (id, amount, type, ...) VALUES (?, ?, ?, ...)'
    );
    for (const bill of bills) {
      await stmt.executeAsync([bill.id, bill.amount, bill.type, ...]);
    }
    await stmt.finalizeAsync();
  });
}
```

### 3. 缓存策略
```typescript
// LRU 缓存热点查询
const billCache = new LRUCache<string, Bill[]>({
  max: 100,
  ttl: 5 * 60 * 1000, // 5 分钟
});

async function getRecentBills(userId: string): Promise<Bill[]> {
  const cacheKey = `recent:${userId}`;
  let bills = billCache.get(cacheKey);
  if (!bills) {
    bills = await db.getAllAsync('SELECT * FROM bills WHERE ... ORDER BY date DESC LIMIT 50');
    billCache.set(cacheKey, bills);
  }
  return bills;
}
```

---

## 🎯 优先级排序

| 优先级 | 任务 | 工作量 | 影响 |
|--------|------|--------|------|
| P0 | 数据库真实加密 | 2 天 | 防止数据泄露 |
| P0 | WebDAV 同步签名 | 1 天 | 防止数据篡改 |
| P1 | 工具参数校验 | 1 天 | 防止脏数据入库 |
| P1 | 多步写入事务 | 2 天 | 保证数据一致性 |
| P1 | 哈希链改 HMAC | 1 天 | 防止篡改证据 |
| P2 | Agent 管线收口 | 2 天 | 统一安全边界 |
| P2 | PII Gate | 1 天 | 防止敏感信息泄露 |
| P3 | 测试补全 | 持续 | 提高代码质量 |

---

## 📝 总结

Wealth-Manager 的架构设计有良好的基础（Agent 分工、DDD 领域模型、统一执行管线），但安全边界没有真正闭合。建议按 P0 → P1 → P2 → P3 的优先级逐步加固。

**核心原则：**
1. **零信任** — 所有外部输入必须校验
2. **最小权限** — Agent 只能访问其职责范围内的工具
3. **数据完整性** — 所有写操作必须有事务保护
4. **审计可追溯** — 所有操作必须有审计日志
