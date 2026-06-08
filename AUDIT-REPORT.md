# Wealth-Manager 深度代码审计报告

> **审计时间**: 2026-06-06
> **审计工具**: Codex CLI (gpt-5.5)
> **审计范围**: 全部 130 个 TypeScript 源文件
> **项目**: https://github.com/kellyson520/Wealth-Manager
> **审计类型**: 逐文件静态深度审计

---

## 📋 审计总览

| 模块 | 致命 | 严重 | 中等 | 轻微 | 总评 |
|------|------|------|------|------|------|
| 项目架构 | 2 | 4 | 3 | 2 | 安全边界未闭合 |
| 核心模块 | 3 | 5 | 3 | 1 | MVP原型级 |
| Agent实现 | 2 | 4 | 2 | 1 | 安全靠prompt没有runtime强制 |
| 工具实现 | 2 | 5 | 4 | 2 | 参数校验分散写入无事务 |
| 领域模型 | 2 | 3 | 2 | 1 | 更像数据模型非DDD |
| 记忆系统 | 2 | 4 | 2 | 1 | 云端脱敏失效隔离缺失 |
| 云端模块 | 3 | 4 | 2 | 1 | 隐私边界不清 |
| 规则引擎 | 1 | 3 | 2 | 1 | 基础关键词分类级 |
| UI组件 | 0 | 4 | 2 | 1 | 视觉成型安全不足 |
| 共享基础设施 | 2 | 4 | 2 | 1 | 执行器被大量绕过 |
| 安全性审计 | 2 | 5 | 4 | 2 | 不建议生产级 |
| 测试覆盖 | 1 | 3 | 2 | 1 | 关键路径无覆盖 |

**合计：约 22 个致命/严重问题，需要系统性整改。**

---

## 项目架构设计

```
**致命**

1. 数据库加密密钥存在硬编码兜底，SQLCipher 等同于可预测密钥。  
[database.ts](/opt/data/Wealth-Manager/src/core/database/database.ts:15) 从 `EXPO_PUBLIC_*` 读取密钥，且 [database.ts](/opt/data/Wealth-Manager/src/core/database/database.ts:25) 有固定默认值。`EXPO_PUBLIC` 也会进入客户端包，不适合做数据库密钥。
修复：密钥必须来自 Keychain/Keystore，首次启动生成随机密钥，禁止默认值。
```ts
import * as SecureStore from 'expo-secure-store';
import * as Random from 'expo-random';

async function getDatabaseKey(): Promise<string> {
  const keyName = 'wm_sqlcipher_key_v1';
  let key = await SecureStore.getItemAsync(keyName);
  if (!key) {
    const bytes = await Random.getRandomBytesAsync(32);
    key = Buffer.from(bytes).toString('base64');
    await SecureStore.setItemAsync(keyName, key, { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK });
  }
  return key;
}
```

2. 权限、确认和审计模型被大量绕过。  
统一执行器在 [tool-executor.ts](/opt/data/Wealth-Manager/src/tools/_pipeline/tool-executor.ts:21) 做权限/确认/审计，但 Agent 多处直接调用工具或 `tool.handler()`，如 [ledger.agent.ts](/opt/data/Wealth-Manager/src/agents/ledger/ledger.agent.ts:74)、[ledger.agent.ts](/opt/data/Wealth-Manager/src/agents/ledger/ledger.agent.ts:380)、[analyst.agent.ts](/opt/data/Wealth-Manager/src/agents/analyst/analyst.agent.ts:308)。这使 L2 确认、审计日志、权限级别都不是强制边界。
修复：禁止 Agent 直接导入 `tools/*`，只能通过 `executeTool()`。
```ts
const entry = getTool('add_bill');
if (!entry) return '工具不可用';
const result = await executeTool(entry, params, { agentId: 'ledger', userConfirmed: false });
```

3. 财务写入缺少事务，可能产生半写入和账实不一致。  
拆账 [bills.tool.ts](/opt/data/Wealth-Manager/src/tools/bills/bills.tool.ts:216)、资产转账 [assets.tool.ts](/opt/data/Wealth-Manager/src/tools/assets/assets.tool.ts:208)、还款 [debt.tool.ts](/opt/data/Wealth-Manager/src/tools/debt/debt.tool.ts:394)、同步合并 [sync.tool.ts](/opt/data/Wealth-Manager/src/tools/webdav/sync.tool.ts:400) 都是多条 SQL 分步执行，无 `BEGIN/COMMIT/ROLLBACK`。
修复：所有多表/多行财务变更必须包事务，并在同一事务内更新哈希、审计。
```ts
await db.execAsync('BEGIN IMMEDIATE');
try {
  await db.runAsync('UPDATE assets SET amount = amount - ? WHERE id = ?', [amount, from]);
  await db.runAsync('UPDATE assets SET amount = amount + ? WHERE id = ?', [amount, to]);
  await writeAuditLog(db, { agent, tool, action: 'transfer_asset', params });
  await db.execAsync('COMMIT');
} catch (e) {
  await db.execAsync('ROLLBACK');
  throw e;
}
```

4. 哈希链不是可靠的篡改证明。  
哈希只包含 `id/date/amount/merchant/type/created_at/prevHash`，遗漏 `category/tags/note/raw_description/source`，见 [hashchain.ts](/opt/data/Wealth-Manager/src/core/hashchain/hashchain.ts:89)。`rebuildHashChain()` 会直接修复并覆盖证据，见 [hashchain.ts](/opt/data/Wealth-Manager/src/core/hashchain/hashchain.ts:133)，`repair_hash_chain` 也直接调用它，见 [security.tool.ts](/opt/data/Wealth-Manager/src/tools/security/security.tool.ts:325)。`split_bill` 和 `refund_bill` 写入后还没有生成哈希，见 [bills.tool.ts](/opt/data/Wealth-Manager/src/tools/bills/bills.tool.ts:194)、[bills.tool.ts](/opt/data/Wealth-Manager/src/tools/bills/bills.tool.ts:245)。
修复：哈希字段覆盖完整规范化账单；修复前导出不可变审计包；禁止静默重建。
```ts
const payload = stableStringify({
  id: bill.id, amount: cents(bill.amount), type: bill.type,
  category: bill.category, tags: JSON.parse(bill.tags || '[]'),
  merchant: bill.merchant, raw_description: bill.raw_description,
  date: bill.date, note: bill.note, source: bill.source,
  created_at: bill.created_at, prev_hash: prevHash,
});
```

**严重**

5. 云端 LLM 仍会上传财务上下文。  
[master.agent.ts](/opt/data/Wealth-Manager/src/agents/master/master.agent.ts:291) 组装 system/user 消息，并在 [master.agent.ts](/opt/data/Wealth-Manager/src/agents/master/master.agent.ts:305) 把本地 NLU 参数写入云端 prompt。PII 检测只覆盖身份证、手机号等，不能覆盖商户、金额、预算、债务等财务隐私。
修复：默认禁用云；云端只允许结构化白名单字段，且不上传原始商户/备注/记忆；`baseUrl` 必须白名单，见 [api.ts](/opt/data/Wealth-Manager/src/core/cloud/api.ts:336)。

6. WebDAV 同步可破坏本地数据库。  
下载合并 [sync.tool.ts](/opt/data/Wealth-Manager/src/tools/webdav/sync.tool.ts:400) 未校验备份签名、版本、表级 schema、哈希链，也无事务；`overwrite` 会直接 `DELETE FROM`，见 [sync.tool.ts](/opt/data/Wealth-Manager/src/tools/webdav/sync.tool.ts:417)。WebDAV 密码加密的 passphrase 是可预测字符串，见 [sync.tool.ts](/opt/data/Wealth-Manager/src/tools/webdav/sync.tool.ts:17)、[sync.tool.ts](/opt/data/Wealth-Manager/src/tools/webdav/sync.tool.ts:60)。
修复：同步包必须 `manifest + schemaVersion + HMAC/signature + hashChainRoot`；合并全程事务；远端凭据放 SecureStore。

7. 导出/备份把原始财务数据作为工具返回值带回 Agent/聊天层。  
[export_csv](/opt/data/Wealth-Manager/src/tools/data/data.tool.ts:54)、[export_json](/opt/data/Wealth-Manager/src/tools/data/data.tool.ts:87)、[create_backup](/opt/data/Wealth-Manager/src/tools/data/data.tool.ts:121) 返回完整内容。任何后续 LLM 或日志链路都可能泄露。
修复：工具只返回 `filePath/rowCount/hash`，不要返回 `csvContent/jsonContent/backupContent`。

8. DomainEventBus 实际不会投递领域事件。  
发布使用 `from: system, to: broadcast`，MessageBus 广播会排除发送者，见 [message-bus.ts](/opt/data/Wealth-Manager/src/core/message-bus/message-bus.ts:66)。订阅却订到 `system`，见 [DomainEventBusImpl.ts](/opt/data/Wealth-Manager/src/infrastructure/events/DomainEventBusImpl.ts:136)。因此 handler 收不到事件。
修复：事件总线维护自己的 handler map，或 MessageBus 支持事件主题订阅，不要把领域事件塞进 Agent 收件人模型。

9. 数据约束不足，非法金额/类型可入库。  
`bills.amount` 只有 `REAL NOT NULL`，无 `CHECK(amount > 0)`，见 [database.ts](/opt/data/Wealth-Manager/src/core/database/database.ts:32)。`modify_bill` 可写负数/超大数，见 [bills.tool.ts](/opt/data/Wealth-Manager/src/tools/bills/bills.tool.ts:92)。`add_bill` 未校验 `Number.isFinite` 和上限，见 [bills.tool.ts](/opt/data/Wealth-Manager/src/tools/bills/bills.tool.ts:16)。
修复：DB CHECK + 应用层统一 validator。
```ts
function assertAmount(v: unknown): number {
  if (typeof v !== 'number' || !Number.isFinite(v) || v <= 0 || v > 99999999) {
    throw new Error('INVALID_AMOUNT');
  }
  return Math.round(v * 100) / 100;
}
```

10. schema 与业务代码不一致，信用卡功能必失败。  
`assets.type` CHECK 只允许中文资产类型，见 [database.ts](/opt/data/Wealth-Manager/src/core/database/database.ts:116)，但 `add_credit_card` 插入 `'信用卡'`，见 [debt.tool.ts](/opt/data/Wealth-Manager/src/tools/debt/debt.tool.ts:476)。
修复：要么把信用卡建到 `debts`/专表，要么扩展 CHECK 并迁移旧库。

**中等**

11. 架构分层方向混乱。  
`application` 依赖 `infrastructure` 类型，见 [BillingService.ts](/opt/data/Wealth-Manager/src/application/BillingService.ts:4)；`core` 依赖 `agents` 类型，见 [tool-cache-wrapper.ts](/opt/data/Wealth-Manager/src/core/cache/tool-cache-wrapper.ts:4)、[function-calling.ts](/opt/data/Wealth-Manager/src/core/cloud/function-calling.ts:1)；`app` 直接调用工具，见 [_layout.tsx](/opt/data/Wealth-Manager/app/_layout.tsx:6)。
修复：接口上移到 `domain/application ports`，`core` 不引用 `agents`，UI/App 只调应用服务或 orchestrator facade。

12. CSV/JSON 导出过滤条件没有绑定参数。  
[export_csv](/opt/data/Wealth-Manager/src/tools/data/data.tool.ts:35) 构造了 `values`，但查询 [data.tool.ts](/opt/data/Wealth-Manager/src/tools/data/data.tool.ts:39) 未传入；JSON 同样见 [data.tool.ts](/opt/data/Wealth-Manager/src/tools/data/data.tool.ts:75)。
修复：`db.getAllAsync(sql, values)`。

13. WebView 图表沙箱还有注入面和 sanitizer 缺陷。  
全局正则 `.test()` 会受 `lastIndex` 影响，见 [sanitizer.ts](/opt/data/Wealth-Manager/src/ui/charts/sanitizer.ts:39)。图表配置被拼进 JS 字符串后 `injectJavaScript`，见 [EChartsSandbox.tsx](/opt/data/Wealth-Manager/src/ui/charts/EChartsSandbox.tsx:268)。`originWhitelist={['*']}` 过宽，见 [EChartsSandbox.tsx](/opt/data/Wealth-Manager/src/ui/charts/EChartsSandbox.tsx:310)。
修复：每次检测创建非 `g` 正则或重置 `lastIndex`；用 `postMessage`/base64 传配置，不拼接 JS 字符串。

14. 死信队列 retry 没有真正重放消息。  
[dead-letter.ts](/opt/data/Wealth-Manager/src/core/message-bus/dead-letter.ts:256) 只增加 retry_count，却把它记为 succeeded。
修复：保存完整消息后调用 `messageBus.publish()`，成功后删除 DLQ，失败保留错误。

15. Token/频率控制与命名不符。  
“monthly” token budget 每天重置，见 [guard.ts](/opt/data/Wealth-Manager/src/core/safety/guard.ts:34)；rate limit 忽略 `maxCallsPerHour/windowMs`，见 [guard.ts](/opt/data/Wealth-Manager/src/core/safety/guard.ts:65)。
修复：按月 key 持久化 token 用量；分钟/小时分别计数。

**轻微**

16. `BillRecord` 类型是 camelCase，但 SQLite 返回 snake_case，见 [types.ts](/opt/data/Wealth-Manager/src/shared/types.ts:7) 和 [bills.tool.ts](/opt/data/Wealth-Manager/src/tools/bills/bills.tool.ts:42)。会造成 UI/业务读 `rawDescription/createdAt` 为空。  
修复：所有 repository/tool 出口统一 mapper。

17. `Money.subtract()` 把负数截断为 0，见 [Money.ts](/opt/data/Wealth-Manager/src/domain/shared/Money.ts:21)。这会掩盖超额还款/超额扣减。  
修复：默认抛错，确需截断时用显式 `subtractFloorZero()`。

18. 领域模型大多没有落地 Repository/Service。  
除 billing 外，budget/asset/debt/rules/automation 多数仍是领域对象加工具直写 DB，聚合根事件没有形成一致事务边界。  
修复：优先迁移财务核心写入：`BillService`、`AssetService`、`DebtService`、`SyncService`。

**总评**

当前项目有 DDD 目录和安全组件，但强制边界没有真正建立：财务写入仍散落在工具和 Agent 中，权限/审计/事务/哈希链都可被绕过。对记账/财务 App 来说，最高优先级是先收敛所有写路径，再补数据库密钥、事务、同步完整性和导出脱敏。测试也需要补到这些边界上：权限绕过、事务回滚、哈希链不可篡改、WebDAV 恶意备份、导出不返回原文、云端不上传财务上下文。
tokens used
189,837
**审计结果**

我按文件清单覆盖了 `src/` 和 `app/` 的核心代码，重点逐文件检查了架构层、数据库、工具、Agent、安全、同步、导出、图表沙箱和测试。验证命令未能运行：仓库当前没有 `node_modules`，`npm run typecheck` 和 `npm test` 都因找不到本地 `typescript`/`jest` 入口失败。

**致命**

1. 数据库加密密钥存在硬编码兜底，SQLCipher 等同于可预测密钥。  
[database.ts](/opt/data/Wealth-Manager/src/core/database/database.ts:15) 从 `EXPO_PUBLIC_*` 读取密钥，且 [database.ts](/opt/data/Wealth-Manager/src/core/database/database.ts:25) 有固定默认值。`EXPO_PUBLIC` 也会进入客户端包，不适合做数据库密钥。
修复：密钥必须来自 Keychain/Keystore，首次启动生成随机密钥，禁止默认值。
```ts
import * as SecureStore from 'expo-secure-store';
import * as Random from 'expo-random';

async function getDatabaseKey(): Promise<string> {
  const keyName = 'wm_sqlcipher_key_v1';
  let key = await SecureStore.getItemAsync(keyName);
  if (!key) {
    const bytes = await Random.getRandomBytesAsync(32);
    key = Buffer.from(bytes).toString('base64');
    await SecureStore.setItemAsync(keyName, key, { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK });
```

---

## 核心模块（缓存/数据库/消息总线/安全）

```
**总评**
核心模块目前更像 MVP 原型，不符合财务 App 的安全和一致性要求。最高优先级应是：真实数据库加密与密钥管理、初始化锁、金额整数化、统一事务、持久化限流/预算、可恢复 DLQ、审计 HMAC/链式签名。现有测试对核心风险覆盖不足，尤其 [database.test.ts](/opt/data/Wealth-Manager/src/__tests__/core/database.test.ts:1) mock 了被测数据库模块本身，不能证明真实初始化、迁移或安全配置正确。建议先补集成级 SQLite 初始化测试、交易失败回滚测试、DLQ 重投测试、限流小时窗口测试，再做业务功能扩展。
tokens used
72,901
**审计范围**
已逐文件阅读：`src/core/cache/{memory-cache.ts,tool-cache-wrapper.ts,index.ts}`、`src/core/database/database.ts`、`src/core/message-bus/{message-bus.ts,dead-letter.ts,index.ts}`、`src/core/safety/{circuit-breaker.ts,guard.ts}`。未运行测试：工作区没有 `node_modules`。

**致命**
1. 数据库“加密”基本不可信。  
[database.ts](/opt/data/Wealth-Manager/src/core/database/database.ts:16) 使用 `EXPO_PUBLIC_WEALTH_MANAGER_DB_KEY`，这是会被打进客户端包里的公开变量；[database.ts](/opt/data/Wealth-Manager/src/core/database/database.ts:25) 还有硬编码默认密钥。即使 `PRAGMA key` 被执行，也没有校验 SQLCipher 是否生效。财务 App 在生产环境下等同于明文库或固定密钥库。

修复：密钥必须来自 Keychain/SecureStore，生产环境缺失直接失败，并校验 cipher。
```ts
async function configureDatabaseSecurity(db: SQLite.SQLiteDatabase) {
  const key = await loadDbKeyFromSecureStore();
  if (!key) throw new Error('Missing database encryption key');

  await db.execAsync(`PRAGMA key = '${key.replace(/'/g, "''")}'`);
  const row = await db.getFirstAsync<{ cipher_version?: string }>('PRAGMA cipher_version');
  if (!row?.cipher_version) throw new Error('Encrypted SQLite is not enabled');

  await db.execAsync('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;');
}
```

2. 数据库单例初始化有竞态，会返回未完成建表/迁移的连接。  
[getDatabase](/opt/data/Wealth-Manager/src/core/database/database.ts:7) 在 `db = await openDatabaseAsync()` 后才执行安全配置和建表；并发调用可能拿到一个尚未 `initTables` 完成的 `db`，或同时跑两套 seed，造成启动失败或半初始化状态。

修复：用 `initPromise` 锁住完整初始化。
```ts
let db: SQLite.SQLiteDatabase | null = null;
let initPromise: Promise<SQLite.SQLiteDatabase> | null = null;

export function getDatabase() {
  if (db) return Promise.resolve(db);
  if (initPromise) return initPromise;

  initPromise = (async () => {
    const opened = await SQLite.openDatabaseAsync('wealth_manager.db');
    await configureDatabaseSecurity(opened);
    await initTables(opened);
    db = opened;
    return opened;
  })().finally(() => { initPromise = null; });

  return initPromise;
}
```

**严重**
3. 金额字段使用 `REAL`，会产生浮点误差。  
[bills.amount](/opt/data/Wealth-Manager/src/core/database/database.ts:32)、[savings_goals](/opt/data/Wealth-Manager/src/core/database/database.ts:87)、[assets](/opt/data/Wealth-Manager/src/core/database/database.ts:117)、[repayments](/opt/data/Wealth-Manager/src/core/database/database.ts:158) 都是 `REAL`。记账系统不应使用二进制浮点做金额存储。

修复：改为整数分，领域层只在展示时格式化。
```sql
amount_cents INTEGER NOT NULL CHECK(amount_cents > 0)
currency TEXT NOT NULL DEFAULT 'CNY'
```

4. 核心库没有提供交易边界，业务层已有资金双写风险。  
核心数据库模块只暴露裸 `db`，没有强制交易 helper。实际调用中资产转账先扣再加，第二条失败会丢钱；还款先插 repayment 再更新 debt，失败会账债不一致。

修复：在核心层提供统一事务 API，资金类操作必须使用。
```ts
export async function withTransaction<T>(fn: (db: SQLite.SQLiteDatabase) => Promise<T>) {
  const db = await getDatabase();
  await db.execAsync('BEGIN IMMEDIATE');
  try {
    const result = await fn(db);
    await db.execAsync('COMMIT');
    return result;
  } catch (e) {
    await db.execAsync('ROLLBACK');
    throw e;
  }
}
```

5. 审计日志哈希会降级到 32 位 FNV，且不是 HMAC，不能抗篡改。  
[hashParams](/opt/data/Wealth-Manager/src/core/database/database.ts:434) 在 `crypto.subtle` 不可用时返回 8 位十六进制哈希；[writeAuditLog](/opt/data/Wealth-Manager/src/core/database/database.ts:410) 也没有链式签名、设备密钥、前后值。攻击者可伪造或碰撞审计记录。

修复：审计摘要使用 HMAC-SHA256，失败直接报错，不允许弱哈希 fallback。
```ts
async function hmacAudit(input: string, key: CryptoKey) {
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(input));
  return [...new Uint8Array(sig)].map(b => b.toString(16).padStart(2, '0')).join('');
}
```

6. 死信队列的 `retryDeadLetters` 没有重试消息。  
[dead-letter.ts](/opt/data/Wealth-Manager/src/core/message-bus/dead-letter.ts:114) 只更新 `retry_count`，然后把 `succeeded++`，没有反序列化 payload，也没有重新 `publish`，所以 DLQ 永远不可恢复。

修复：读出完整消息，重新投递，成功后删除。
```ts
const rows = await db.getAllAsync<DeadLetterRow>('SELECT * FROM dead_letter_queue WHERE retry_count < 3 LIMIT ?', [limit]);
for (const r of rows) {
  try {
    await messageBus.publish({
      from: r.from_agent as AgentId,
      to: r.to_agent as AgentId,
      type: r.type as BusMessage['type'],
      payload: JSON.parse(r.payload),
      correlationId: r.correlation_id ?? undefined,
    });
    await db.runAsync('DELETE FROM dead_letter_queue WHERE id = ?', [r.id]);
    succeeded++;
  } catch (e) {
    await db.runAsync('UPDATE dead_letter_queue SET retry_count = retry_count + 1, last_retry_at = ? WHERE id = ?', [now, r.id]);
  }
}
```

7. 安全限额逻辑失效：月额度每天重置，小时限流未实现。  
[guard.ts](/opt/data/Wealth-Manager/src/core/safety/guard.ts:19) 叫 `monthlyLimit`，但 [guard.ts](/opt/data/Wealth-Manager/src/core/safety/guard.ts:35) 只比较“几号”，每天都会重置；[guard.ts](/opt/data/Wealth-Manager/src/core/safety/guard.ts:65) 完全忽略 `maxCallsPerHour` 和 `windowMs`。重启 App 后内存计数也全部丢失。

修复：持久化月窗口和分钟/小时双窗口，并校验数值。
```ts
if (!Number.isFinite(estimatedTokens) || estimatedTokens < 0) {
  return { allowed: false, remaining: 0, warning: true, reason: 'invalid token estimate' };
}
const monthKey = new Date().toISOString().slice(0, 7); // YYYY-MM
if (budget.period !== monthKey) { budget.used = 0; budget.period = monthKey; }
```

8. 直接消息无人订阅时只记录错误，不进死信。  
[message-bus.ts](/opt/data/Wealth-Manager/src/core/message-bus/message-bus.ts:86) 对非 broadcast 丢消息，只 `captureError`。这与项目 ADR 的 at-least-once 目标冲突。

修复：无人订阅也写 DLQ。
```ts
if (deliveries.length === 0 && msg.to !== 'broadcast') {
  await moveToDeadLetter(fullMsg, msg.to, 'NO_SUBSCRIBER');
}
```

9. 工具缓存没有用户/账户/时间上下文，可能串数据。  
[tool-cache-wrapper.ts](/opt/data/Wealth-Manager/src/core/cache/tool-cache-wrapper.ts:40) 只用 `toolName + args` 作为 key。Web/多账户/切换用户时，相同参数会复用上一用户的财务结果。

修复：缓存 key 必须包含用户、账本、权限版本和时间窗口。
```ts
const cacheKey = buildCacheKey(tool.definition.name, {
  userId,
  ledgerId,
  permissionVersion,
  args,
});
```

**中等**
10. 全局 circuit breaker 会让一个工具拖垮所有幂等工具。  
[tool-cache-wrapper.ts](/opt/data/Wealth-Manager/src/core/cache/tool-cache-wrapper.ts:8) 只有一个 breaker；某个网络工具失败 5 次后，所有 idempotent 工具都被拒绝。

修复：按工具名维护 breaker。
```ts
const breakers = new Map<string, CircuitBreaker>();
const breaker = breakers.get(name) ?? createCircuitBreaker(5, 60_000);
breakers.set(name, breaker);
```

11. circuit breaker 的 half-open 没有限制探测并发。  
[circuit-breaker.ts](/opt/data/Wealth-Manager/src/core/safety/circuit-breaker.ts:21) 进入 `half_open` 后所有并发请求都放行，一个成功即可关闭，可能掩盖仍在失败的依赖。

修复：增加 `probeInFlight`。
```ts
if (cb.state === 'half_open') {
  if (cb.probeInFlight) return false;
  cb.probeInFlight = true;
  return true;
}
```

12. 消息总线没有超时、背压、payload 大小限制，且同一个 message 对象传给所有 handler。  
[message-bus.ts](/opt/data/Wealth-Manager/src/core/message-bus/message-bus.ts:79) handler 可挂死 `publish`，也可修改 `payload` 影响其他订阅者。

修复：投递前 clone/freeze，单 handler timeout。
```ts
const safeMsg = structuredClone(fullMsg);
await Promise.race([
  handler(Object.freeze(safeMsg)),
  new Promise((_, reject) => setTimeout(() => reject(new Error('handler timeout')), 5000)),
]);
```

13. DLQ 查询参数未限制下限，负数 `LIMIT` 可能变成无限查询。  
[dead-letter.ts](/opt/data/Wealth-Manager/src/core/message-bus/dead-letter.ts:85) 和 [dead-letter.ts](/opt/data/Wealth-Manager/src/core/message-bus/dead-letter.ts:121) 只 `Math.min`，`limit = -1` 在 SQLite 中可能返回全部记录。

修复：
```ts
const limit = Math.max(1, Math.min(Number(params?.limit ?? 50), 200));
```

14. `MemoryCache` 可被 `maxSize <= 0` 打成死循环。  
[memory-cache.ts](/opt/data/Wealth-Manager/src/core/cache/memory-cache.ts:115) 中 `while (this.cache.size >= this.maxSize)`，当 `maxSize=0` 时永远成立。

修复：
```ts
constructor(maxSize = 500, defaultTTLMs = 30 * 60_000) {
  if (!Number.isInteger(maxSize) || maxSize < 1) throw new Error('maxSize must be >= 1');
  if (!Number.isFinite(defaultTTLMs) || defaultTTLMs <= 0) throw new Error('TTL must be positive');
}
```

15. 数据库迁移没有版本表，且吞掉所有 ALTER 错误。  
[migrateAuditLog](/opt/data/Wealth-Manager/src/core/database/database.ts:282) 捕获所有异常并假设“列已存在”，会掩盖磁盘损坏、权限错误、SQL 错误。

修复：使用 `PRAGMA user_version` 和显式错误判断，只忽略 duplicate column。
```ts
try { await db.execAsync(sql); }
catch (e) {
  if (!String(e).includes('duplicate column name')) throw e;
}
```

16. 核心表缺少关键索引。  
`bills` 没有 `date/type/category/merchant` 索引，统计查询会随账单增长变慢；`audit_log` 没有 `timestamp/tool/result_status` 索引。

修复：
```sql
CREATE INDEX IF NOT EXISTS idx_bills_date_type ON bills(date, type);
CREATE INDEX IF NOT EXISTS idx_bills_category_date ON bills(category, date);
CREATE INDEX IF NOT EXISTS idx_audit_timestamp ON audit_log(timestamp DESC);
```

**轻微**
17. `MemoryCache` 名义上是 LRU，但实际按 `createdAt` FIFO 淘汰，`hitCount` 不参与淘汰。  
[memory-cache.ts](/opt/data/Wealth-Manager/src/core/cache/memory-cache.ts:121) 对热点数据不友好。修复：`get()` 时更新 `lastAccessedAt`，按最老访问淘汰。

18. `set` 使用 `ttlMs || defaultTTL`，无法表达 `ttlMs=0`，负 TTL 也未拒绝。  
[memory-cache.ts](/opt/data/Wealth-Manager/src/core/cache/memory-cache.ts:61) 修复为 `ttlMs ?? defaultTTL` 并校验正数。

19. `isCircuitOpen()` 是读方法但会改变状态。  
[tool-cache-wrapper.ts](/opt/data/Wealth-Manager/src/core/cache/tool-cache-wrapper.ts:22) 调用 `canCall` 会把 open 推到 half_open。修复：提供纯读取 `getCircuitSnapshot()`。

20. `index.ts` 文件本身无业务 bug，只是直接重导出；风险来自被导出的可变全局单例。

**总评**
核心模块目前更像 MVP 原型，不符合财务 App 的安全和一致性要求。最高优先级应是：真实数据库加密与密钥管理、初始化锁、金额整数化、统一事务、持久化限流/预算、可恢复 DLQ、审计 HMAC/链式签名。现有测试对核心风险覆盖不足，尤其 [database.test.ts](/opt/data/Wealth-Manager/src/__tests__/core/database.test.ts:1) mock 了被测数据库模块本身，不能证明真实初始化、迁移或安全配置正确。建议先补集成级 SQLite 初始化测试、交易失败回滚测试、DLQ 重投测试、限流小时窗口测试，再做业务功能扩展。
Reading additional input from stdin...
OpenAI Codex v0.137.0
--------
workdir: /opt/data/Wealth-Manager
model: gpt-5.5
provider: codex
approval: never
sandbox: danger-full-access
reasoning effort: high
reasoning summaries: none
session id: 019e9be0-58b8-7f13-8369-44e844ad3b2d
--------
user
你是代码审计专家。请对 Wealth-Manager 项目进行深度审计。

审计任务：审计 src/agents/ 目录下的所有Agent实现：master、ledger、analyst、coach、guardian，检查Agent间通信和职责划分

要求：
1. 逐文件阅读相关代码，不要跳过
```

---

## Agent 实现

```
**总评**
当前 Agent 目录的主要问题不是单个正则或单个 handler，而是“安全边界写在 prompt/profile 中，运行时没有统一强制”。建议优先做三件事：第一，所有工具调用改为 `executeTool`；第二，云端路径默认禁止财务上下文，必须脱敏和显式授权；第三，消息总线和 NLU 学习加白名单、鉴权、参数剥离和测试。完成这三项后，再清理职责错配、输入校验和死信重试。
tokens used
142,800
已逐文件阅读 `src/agents/` 下 23 个文件，并补读了 `tool-executor`、`message-bus`、部分安全/账单工具以核对运行时边界。`npx tsc --noEmit` 未能执行，当前环境没有本地 TypeScript 编译器，npx 返回安装提示。

**致命**
1. 云端 LLM 会接收财务上下文和记忆，违反“禁止向云端发送任何数据”。
[master.agent.ts](/opt/data/Wealth-Manager/src/agents/master/master.agent.ts:285) 会把 `adaptiveContext`、近期记忆、本地 NLU 参数、用户原文发给 `callCloudLLM`；流式路径同样存在于 [master.agent.ts](/opt/data/Wealth-Manager/src/agents/master/master.agent.ts:440)。这些内容可能包含商户、金额、账单语义、AI 记忆。
修复：财务意图默认本地执行；云端只允许非财务闲聊或显式授权后的白名单字段。
```ts
if (isFinancialIntent(intent)) return routeIntent(intent);

const safe = sanitizeCloudData({
  period: intent.params.period,
  type: intent.params.type,
  category: intent.params.category,
});
messages.push({ role: 'user', content: JSON.stringify(safe) });
```

2. 大量 Agent 绕过统一权限、确认、超时和审计执行器。
`executeTool` 本来会校验 `allowedAgents`、权限等级和 L2 确认：[tool-executor.ts](/opt/data/Wealth-Manager/src/tools/_pipeline/tool-executor.ts:21)。但 Ledger/Coach/Analyst/Guardian 多处直接调用工具函数或 `tool.handler`，例如 [ledger.agent.ts](/opt/data/Wealth-Manager/src/agents/ledger/ledger.agent.ts:74)、[coach.agent.ts](/opt/data/Wealth-Manager/src/agents/coach/coach.agent.ts:113)、[analyst.agent.ts](/opt/data/Wealth-Manager/src/agents/analyst/analyst.agent.ts:308)、[guardian.agent.ts](/opt/data/Wealth-Manager/src/agents/guardian/guardian.agent.ts:223)。这会让安全 profile 变成文档约束。
修复：禁止 Agent 直接 import 业务工具，统一走包装函数。
```ts
async function runAgentTool(agentId: AgentId, name: string, params: Record<string, unknown>, confirmed = false) {
  const entry = getTool(name);
  if (!entry) return { success: false, error: '工具不可用' };
  return executeTool(entry, params, { agentId, userConfirmed: confirmed });
}
```

3. Guardian 预检失败时放行写入。
[guardian.agent.ts](/opt/data/Wealth-Manager/src/agents/guardian/guardian.agent.ts:60) 在 `run_safety_check` 失败或无数据时返回 `{ safe: true }`。安全扫描 DB 异常、迁移失败、工具异常时，记账仍会继续。
修复：财务写操作应 fail-closed，或返回需要用户确认的阻断状态。
```ts
if (!result.success || !result.data) {
  return { safe: false, message: '安全预检失败，已阻止写入。请稍后重试。' };
}
```

**严重**
4. 消息总线没有真正实现安全委派。
`initMessageBus` 收到任何 request 后都构造 `intent: 'unknown'` 调 Agent：[master.agent.ts](/opt/data/Wealth-Manager/src/agents/master/master.agent.ts:55)。没有 `canDelegate` 校验、没有目标能力校验、没有请求/响应等待 API，导致文档里的 Agent 间通信基本不可用且不可审计。底层 `publish` 也只投递，不鉴权：[message-bus.ts](/opt/data/Wealth-Manager/src/core/message-bus/message-bus.ts:57)。
修复：消息 payload 必须包含 `intent`，总线或订阅入口强制 `canDelegate(msg.from, msg.to)`。
```ts
if (!canDelegate(msg.from, target)) throw new Error('delegation denied');
const delegated = msg.payload.intent as IntentResult;
if (delegated.agent !== target) throw new Error('target mismatch');
```

5. NLU 学习样本可持久化覆盖路由和参数，缺少白名单校验。
[applyLearnedIntent](/opt/data/Wealth-Manager/src/agents/master/nlu-learning.ts:183) 对 exact match 无视静态高置信结果直接覆盖；样本来自 DB 和云端函数推断：[nlu-learning.ts](/opt/data/Wealth-Manager/src/agents/master/nlu-learning.ts:73)、[master.agent.ts](/opt/data/Wealth-Manager/src/agents/master/master.agent.ts:335)。一旦样本被污染，可把普通文本映射到写操作并携带历史参数。
修复：只允许白名单 intent/agent 组合，剥离 `confirmed`、`billId`、金额等高风险参数，写操作学习必须来自用户反馈。
```ts
const ALLOWED = { ledger: ['search_bills'], analyst: ['get_summary'], coach: ['get_advice'] };
if (!ALLOWED[sample.agent]?.includes(sample.intent)) return base;
const params = omit(sample.params, ['confirmed', 'billId', 'amount']);
```

6. 跨 Agent 记忆隔离失效，并可能被发往云端。
`saveMemory` 把 agent 写进 JSON 内容，但 `recallMemory` 查询没有按 `agentId` 过滤：[memory.ts](/opt/data/Wealth-Manager/src/agents/_shared/memory.ts:63)。Master 的 `recallRecentContext('master')` 可能召回其他 Agent 的财务事件，随后进入云端 prompt。
修复：数据库增加 `agent_id` 列并强制过滤；旧数据可用 JSON 提取迁移。
```ts
conditions.push('agent_id = ?');
values.push(params.agentId);
```

7. Analyst 被声明为只读 L0，但可直接导出账单 CSV。
Analyst profile 是 `maxPermissionLevel: 0`：[security-profile.ts](/opt/data/Wealth-Manager/src/agents/_shared/security-profile.ts:103)。`export_csv` 是 L1：[init-tools.ts](/opt/data/Wealth-Manager/src/agents/_shared/init-tools.ts:1429)，但 Analyst 直接 `tool.handler` 导出：[analyst.agent.ts](/opt/data/Wealth-Manager/src/agents/analyst/analyst.agent.ts:305)，绕过 `executeTool` 后 profile 无效。
修复：导出应路由 Guardian，或把 Analyst 的导出意图改为“生成导出申请”。

8. L2 敏感操作确认机制不一致。
`repair_hash_chain` 注册为 L2：[init-tools.ts](/opt/data/Wealth-Manager/src/agents/_shared/init-tools.ts:612)，但 Guardian 直接调用工具：[guardian.agent.ts](/opt/data/Wealth-Manager/src/agents/guardian/guardian.agent.ts:271)，没有走统一审计确认。`revoke_cloud_access` handler 完全不接收 `confirmed`，当前永远失败：[security.tool.ts](/opt/data/Wealth-Manager/src/tools/security/security.tool.ts:285)。
修复：L2 只允许 `executeTool(..., { userConfirmed: true })`；工具签名也接收确认参数。

**中等**
9. 输入和金额校验不足。
Ledger 只检查 `amount <= 0`，未落实 `<99999999`、有限数字、精度、字符串长度：[ledger.agent.ts](/opt/data/Wealth-Manager/src/agents/ledger/ledger.agent.ts:55)。预算、资产、债务、转账、cron、通知时间也缺少上限和格式校验。`sanitize_input` 只处理部分 HTML/XSS 形态：[security.tool.ts](/opt/data/Wealth-Manager/src/tools/security/security.tool.ts:140)。
修复：建立本地轻量 validator，不新增依赖。
```ts
function validMoney(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v) && v > 0 && v < 99_999_999;
}
```

10. 职责划分和工具注册不一致。
Ledger 的 `list_assets` handler 会取 `list_assets`：[ledger.agent.ts](/opt/data/Wealth-Manager/src/agents/ledger/ledger.agent.ts:223)，但注册只允许 Analyst/Coach：[init-tools.ts](/opt/data/Wealth-Manager/src/agents/_shared/init-tools.ts:1118)。Coach 直接调用 Guardian-only 的 `schedule_daily_reminder`：[coach.agent.ts](/opt/data/Wealth-Manager/src/agents/coach/coach.agent.ts:437)、[init-tools.ts](/opt/data/Wealth-Manager/src/agents/_shared/init-tools.ts:819)。这说明职责边界没有被测试覆盖。
修复：统一 “handler 所在 Agent == allowedAgents + security profile” 的快照测试。

11. 分享和同步默认过宽。
Coach `share_bills` 无参数调用 `create_link`，直接返回 token：[coach.agent.ts](/opt/data/Wealth-Manager/src/agents/coach/coach.agent.ts:470)。Guardian 的 WebDAV 上传没有强制加密参数：[guardian.agent.ts](/opt/data/Wealth-Manager/src/agents/guardian/guardian.agent.ts:433)。
修复：分享必须要求账单范围、过期时间、确认；同步上传默认 `encrypt: true`，缺少口令则拒绝。

12. 死信重试是伪重试。
`retryDeadLetters` 只更新 retry_count 并计为 succeeded，没有重新 publish 原消息：[dead-letter.ts](/opt/data/Wealth-Manager/src/core/message-bus/dead-letter.ts:119)。这会让运维指标误导。
修复：保存完整消息并调用 `messageBus.publish`，成功后删除死信。

**轻微**
13. `processMessage` 的可选 `handleIntent` 参数完全未使用：[master.agent.ts](/opt/data/Wealth-Manager/src/agents/master/master.agent.ts:173)。删除或接入测试注入点。
14. `routeIntent` 默认路由到 Ledger：[master.agent.ts](/opt/data/Wealth-Manager/src/agents/master/master.agent.ts:237)。未知 agent 应拒绝，而不是落到记账域。
15. 审计日志失败被静默吞掉：[tool-executor.ts](/opt/data/Wealth-Manager/src/tools/_pipeline/tool-executor.ts:193)。财务 App 至少应记录本地 logger，并对高权限写操作 fail-closed。

**总评**
当前 Agent 目录的主要问题不是单个正则或单个 handler，而是“安全边界写在 prompt/profile 中，运行时没有统一强制”。建议优先做三件事：第一，所有工具调用改为 `executeTool`；第二，云端路径默认禁止财务上下文，必须脱敏和显式授权；第三，消息总线和 NLU 学习加白名单、鉴权、参数剥离和测试。完成这三项后，再清理职责错配、输入校验和死信重试。
Reading additional input from stdin...
OpenAI Codex v0.137.0
--------
workdir: /opt/data/Wealth-Manager
model: gpt-5.5
provider: codex
approval: never
sandbox: danger-full-access
reasoning effort: high
reasoning summaries: none
session id: 019e9be5-fb22-7a03-b28c-1b585f7fd2e5
--------
user
你是代码审计专家。请对 Wealth-Manager 项目进行深度审计。

审计任务：审计 src/tools/ 目录下的所有工具实现：账单、预算、资产、债务、自动化等，检查工具执行管道的健壮性

要求：
1. 逐文件阅读相关代码，不要跳过
2. 找出所有 bug、安全漏洞、性能问题、设计缺陷
3. 对每个问题给出具体的修复建议和代码示例
4. 按严重程度排序（致命 > 严重 > 中等 > 轻微）
5. 最后给出总评和改进建议
```

---

## 工具实现

```
**总评**

当前 `src/tools/` 还停留在 MVP 工具层：参数校验分散、写入无事务、权限分级偏乐观、审计链覆盖不足、同步恢复风险很高。对财务 App 来说，最大风险不是 SQL 注入，当前参数化做得基本可以；真正的问题是数据一致性、误成功、超时重试、备份恢复和敏感数据外发。

建议优先级：

1. 先修执行管道：非幂等工具禁 retry，支持取消/幂等键，L2 确认统一由执行器 enforce。
2. 建立工具层通用 `validation + mapper + transaction` 模块，所有写工具迁移过去。
3. 修 WebDAV 恢复和导出权限，禁止完整内容出现在 tool result。
4. 重做哈希链字段覆盖和所有账单写路径。
5. 补测试：21 个工具文件至少都有基础测试；重点加事务失败、超时重试、同步恢复、权限确认、哈希链完整性测试。
tokens used
268,277
已逐文件审计 `src/tools/` 全部 21 个文件，并交叉看了工具注册、数据库 schema、哈希链、同步加密和现有测试。验证命令未能跑通：仓库没有安装 `node_modules`，`npx tsc --noEmit` 拉到了错误的包，`npx jest` 又缺 `jest-expo` preset。应先 `npm ci` 后用 `npm run typecheck && npm test`。

**致命**

1. 工具超时不会取消真实写入，重试会造成重复/脏写  
[tool-executor.ts](/opt/data/Wealth-Manager/src/tools/_pipeline/tool-executor.ts:45) 用 `Promise.race` 超时，但底层 `entry.handler(params)` 仍会继续执行；同时 `add_bill`、导入等非幂等写工具被注册为 `retryable: true`，见 [init-tools.ts](/opt/data/Wealth-Manager/src/agents/_shared/init-tools.ts:160) 和 [init-tools.ts](/opt/data/Wealth-Manager/src/agents/_shared/init-tools.ts:1350)。结果是“调用已超时/重试”，旧写入仍落库，新调用再写一次。  
修复：非幂等写入默认 `retryable: false`；写入工具必须有 `idempotencyKey`；执行器传 `AbortSignal`，超时后 handler 必须感知取消。

```ts
// init-tools.ts
retryable: false, // add_bill/import/split/transfer/repayment 等写入工具

// tool-executor.ts
const controller = new AbortController();
const timer = setTimeout(() => controller.abort(), entry.definition.timeout);
const result = await entry.handler(params, { signal: controller.signal });
clearTimeout(timer);
```

2. WebDAV 恢复可导致整库不可逆半覆盖  
[sync.tool.ts](/opt/data/Wealth-Manager/src/tools/webdav/sync.tool.ts:329) 下载后直接 `mergeData`；`overwrite` 会逐表 `DELETE` 再逐行 `INSERT OR REPLACE`，没有事务、没有本地快照、没有 schema/version 校验、没有外键顺序保护，见 [sync.tool.ts](/opt/data/Wealth-Manager/src/tools/webdav/sync.tool.ts:416)。中途失败会留下半空数据库。  
修复：下载恢复前创建本地快照；校验 `_metadata`、表白名单、必填列、字段类型；全量恢复包在一个事务里；失败必须 rollback；恢复后重建/验证哈希链。

```ts
await db.execAsync('BEGIN IMMEDIATE');
try {
  validateBackup(backup);
  await mergeData(db, backup, strategy);
  await rebuildHashChain();
  await db.execAsync('COMMIT');
} catch (e) {
  await db.execAsync('ROLLBACK');
  throw e;
}
```

3. 哈希链不能证明账单完整性  
[hashchain.ts](/opt/data/Wealth-Manager/src/core/hashchain/hashchain.ts:89) 只 hash `id/date/amount/merchant/type/created_at/prevHash`，不覆盖 `category/tags/raw_description/note/source`；导入、OCR、拆分、退款均插入账单但不更新哈希链，见 [import.tool.ts](/opt/data/Wealth-Manager/src/tools/import/import.tool.ts:60)、[bills.tool.ts](/opt/data/Wealth-Manager/src/tools/bills/bills.tool.ts:216)、[bills.tool.ts](/opt/data/Wealth-Manager/src/tools/bills/bills.tool.ts:267)。攻击者或 bug 修改分类/备注不会被发现。  
修复：所有账单字段进入 canonical hash；所有账单写路径必须更新或重建链；“修复哈希链”应先导出断裂证据，不能静默覆盖证据。

```ts
function computeBillHash(bill: BillRow, prevHash: string): string {
  return sha256(JSON.stringify({
    id: bill.id,
    amount: normalizeMoney(bill.amount),
    type: bill.type,
    category: bill.category,
    tags: bill.tags,
    merchant: bill.merchant,
    raw_description: bill.raw_description,
    date: bill.date,
    note: bill.note,
    source: bill.source,
    created_at: bill.created_at,
    prevHash,
  }));
}
```

**严重**

4. 多步财务写入没有事务  
`add_bill` 插入后再 hash、`modify_bill` 更新后异步记录纠错再重建、`split_bill` 多笔插入后改原账单备注、`transfer_asset` 先扣再加、`record_repayment` 先插还款再改债务余额，分别见 [bills.tool.ts](/opt/data/Wealth-Manager/src/tools/bills/bills.tool.ts:26)、[bills.tool.ts](/opt/data/Wealth-Manager/src/tools/bills/bills.tool.ts:108)、[bills.tool.ts](/opt/data/Wealth-Manager/src/tools/bills/bills.tool.ts:216)、[assets.tool.ts](/opt/data/Wealth-Manager/src/tools/assets/assets.tool.ts:208)、[debt.tool.ts](/opt/data/Wealth-Manager/src/tools/debt/debt.tool.ts:164)。任一步失败都会造成余额/账单/哈希不一致。  
修复：这些函数全部用 `BEGIN IMMEDIATE/COMMIT/ROLLBACK` 包起来；并发更新使用条件更新。

```ts
await db.execAsync('BEGIN IMMEDIATE');
try {
  const res = await db.runAsync(
    'UPDATE assets SET amount = amount - ? WHERE id = ? AND amount >= ?',
    [amount, fromId, amount]
  );
  if (res.changes !== 1) throw new Error('余额不足或资产不存在');
  await db.runAsync('UPDATE assets SET amount = amount + ? WHERE id = ?', [amount, toId]);
  await db.execAsync('COMMIT');
} catch (e) {
  await db.execAsync('ROLLBACK');
  throw e;
}
```

5. 输入验证不足，可写入 NaN/Infinity/负数/非法日期  
`modify_bill` 未校验 `amount/date/type`，可把金额改成负数或 NaN，见 [bills.tool.ts](/opt/data/Wealth-Manager/src/tools/bills/bills.tool.ts:92)。`update_asset_value` 未禁止负数/NaN，见 [assets.tool.ts](/opt/data/Wealth-Manager/src/tools/assets/assets.tool.ts:122)。`record_repayment` 允许超额还款并直接把余额截断为 0，见 [debt.tool.ts](/opt/data/Wealth-Manager/src/tools/debt/debt.tool.ts:162)。导入日期不规范化，见 [import.tool.ts](/opt/data/Wealth-Manager/src/tools/import/import.tool.ts:57)。  
修复：集中参数 schema 校验；金额必须有限、正数、上限明确；日期必须 `YYYY-MM-DD` 且可解析；还款额不得超过 remaining，除非显式记录溢缴。

```ts
function assertMoney(n: unknown, name = 'amount') {
  if (typeof n !== 'number' || !Number.isFinite(n) || n <= 0 || n > 99_999_999) {
    throw new Error(`${name} invalid`);
  }
}
function assertDate(s: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || Number.isNaN(Date.parse(`${s}T00:00:00Z`))) {
    throw new Error('date invalid');
  }
}
```

6. 数据导出/同步权限过低且返回敏感内容  
`export_csv`/`export_json` 把 `csvContent/jsonContent` 放回工具结果，见 [data.tool.ts](/opt/data/Wealth-Manager/src/tools/data/data.tool.ts:54) 和 [data.tool.ts](/opt/data/Wealth-Manager/src/tools/data/data.tool.ts:87)；`create_backup` 返回完整 `backupContent`，见 [data.tool.ts](/opt/data/Wealth-Manager/src/tools/data/data.tool.ts:121)。这些工具注册为 L1，见 [init-tools.ts](/opt/data/Wealth-Manager/src/agents/_shared/init-tools.ts:1427)。`sync_upload` 会外发全量财务数据却也是 L1，见 [init-tools.ts](/opt/data/Wealth-Manager/src/agents/_shared/init-tools.ts:1559)。  
修复：导出、备份、云同步至少 L2 并要求用户确认；工具结果只返回文件名/大小/摘要，不返回完整内容。

```ts
return { success: true, data: { filename, filePath, rowCount: rows.length, sha256 } };
// 不返回 csvContent/jsonContent/backupContent
```

7. WebDAV 密码存储不是强秘密保护  
[saveConfig](/opt/data/Wealth-Manager/src/tools/webdav/sync.tool.ts:46) 用 `SECRET_STORAGE_KEY:url:username` 派生密钥加密密码，这个 key 是代码常量组合，不是设备秘密；如果 `encryptPayload` 失败，`storedConfig.password` 会原样写入 `sync_state`，见 [sync.tool.ts](/opt/data/Wealth-Manager/src/tools/webdav/sync.tool.ts:46)。  
修复：加密失败直接拒绝保存；密码放系统安全存储，DB 只存引用；不能使用可从代码推导的 passphrase。

```ts
const encrypted = await encryptPayload(config.password, deviceSecret);
if (!encrypted) throw new Error('credential encryption unavailable');
delete storedConfig.password;
```

8. schema/实现不一致导致功能必坏  
`add_credit_card` 插入 `assets.type='信用卡'`，但表 CHECK 只允许 `现金/银行账户/股票/基金/房产/车辆/债权/其他`，见 [debt.tool.ts](/opt/data/Wealth-Manager/src/tools/debt/debt.tool.ts:246) 和 [database.ts](/opt/data/Wealth-Manager/src/core/database/database.ts:78)。`register_shortcut/get_shortcuts` 使用不存在的 `shortcuts` 表，并且写失败还返回成功，见 [automation.tool.ts](/opt/data/Wealth-Manager/src/tools/automation/automation.tool.ts:103)。`create_backup` 读取不存在的 `budget_limits` 表并吞错，见 [data.tool.ts](/opt/data/Wealth-Manager/src/tools/data/data.tool.ts:102)。  
修复：补 migration 或改实现；任何表不存在不能伪成功。

```sql
CREATE TABLE IF NOT EXISTS shortcuts (...);
-- 或删除 register_shortcut 的 DB 写入假成功分支
```

9. snake_case 行被强行当 camelCase 类型返回  
多处 `SELECT *` 直接声明成 `BillRecord/SavingsGoal/Achievement/RecurringTask`，例如 [bills.tool.ts](/opt/data/Wealth-Manager/src/tools/bills/bills.tool.ts:42)、[budget.tool.ts](/opt/data/Wealth-Manager/src/tools/budget/budget.tool.ts:67)、[gamification.tool.ts](/opt/data/Wealth-Manager/src/tools/gamification/gamification.tool.ts:79)。实际行是 `raw_description/current_amount/max_progress/created_at`，上层访问 `rawDescription/currentAmount/maxProgress` 会得到 `undefined/NaN`。  
修复：所有 DB 行经过 mapper。

```ts
function mapBill(row: BillRow): BillRecord {
  return {
    id: row.id,
    amount: row.amount,
    type: row.type,
    category: row.category,
    tags: JSON.parse(row.tags || '[]'),
    merchant: row.merchant,
    rawDescription: row.raw_description,
    date: row.date,
    note: row.note,
    source: row.source,
    createdAt: row.created_at,
  };
}
```

10. 预算逻辑错误  
`check_budget_overrun` 声明支持 `amount` 预估但完全没用，见 [budget.tool.ts](/opt/data/Wealth-Manager/src/tools/budget/budget.tool.ts:103)。`period='weekly'` 也永远按月初计算，见 [budget.tool.ts](/opt/data/Wealth-Manager/src/tools/budget/budget.tool.ts:119)。`set_budget` 的 JSON 读改写没有事务，两个并发预算更新会丢一个，见 [budget.tool.ts](/opt/data/Wealth-Manager/src/tools/budget/budget.tool.ts:19)。  
修复：预算限制独立表或 JSON 写入加事务；按 period 计算窗口；预估新增金额加入 spent。

```ts
const startDate = limit.period === 'weekly' ? weekStartISO(now) : monthStartISO(now);
const spent = (expenseRow?.total || 0) + (params.category === limit.category ? params.amount || 0 : 0);
```

11. 资产/净资产统计口径错误  
`get_net_balance` 用 bills 的 income/expense 当资产和债务，见 [stats.tool.ts](/opt/data/Wealth-Manager/src/tools/stats/stats.tool.ts:107)，但项目已有 `assets/debts` 表。结果净资产严重失真。  
修复：用 `assets.amount` 汇总资产、`debts.remaining` 汇总债务，现金余额单独由现金/银行账户资产统计。

```ts
SELECT COALESCE(SUM(amount),0) FROM assets;
SELECT COALESCE(SUM(remaining),0) FROM debts WHERE status != 'cleared';
```

**中等**

12. 查询 limit/offset 未做上限和非负校验  
`search_bills/list_assets/list_debts/list_tags/list_reimbursements/get_merchant_summary` 都接受任意 limit，见 [bills.tool.ts](/opt/data/Wealth-Manager/src/tools/bills/bills.tool.ts:179)。  
修复：`limit = clamp(toInt(limit, 50), 1, 200)`；`offset >= 0`。

13. 批量导入没有去重、事务和哈希更新  
CSV/微信/支付宝/OCR 导入逐行插入，失败后部分成功，重试会重复，见 [import.tool.ts](/opt/data/Wealth-Manager/src/tools/import/import.tool.ts:35) 和 [ocr.tool.ts](/opt/data/Wealth-Manager/src/tools/import/ocr.tool.ts:20)。  
修复：导入批次表 + raw hash 去重；事务提交；提交后重建哈希链。

14. 分享令牌弱且分享存储不可审计  
[sharing.tool.ts](/opt/data/Wealth-Manager/src/tools/sharing/sharing.tool.ts:16) 用 UUID 截断 12 字符作为 token；link 存内存，重启丢失，不入审计；不传过滤条件会分享最近 200 笔账单，见 [sharing.tool.ts](/opt/data/Wealth-Manager/src/tools/sharing/sharing.tool.ts:38)。  
修复：用 `crypto.getRandomValues` 生成 128-bit token；持久化带过期；创建链接必须显式 billIds 或确认范围。

15. 任务调度 cron 无严格校验，backup/report 任务空跑也记成功  
非法 cron 会走“每小时执行”兜底，见 [task-scheduler.ts](/opt/data/Wealth-Manager/src/tools/automation/task-scheduler.ts:57)；`backup/report` 分支为空，见 [task-scheduler.ts](/opt/data/Wealth-Manager/src/tools/automation/task-scheduler.ts:126)。  
修复：创建任务时解析 cron，非法拒绝；未实现任务不能创建或执行后标记失败。

16. CSV 导出有公式注入风险  
`export_csv` 只处理逗号/引号/换行，不处理以 `= + - @` 开头的单元格，见 [data.tool.ts](/opt/data/Wealth-Manager/src/tools/data/data.tool.ts:129)。  
修复：导出到 CSV 前对可控文本加前缀 `'` 或转义公式起始字符。

17. 规则批量应用不重建哈希链，也没有事务  
`rules_apply` 直接批量更新账单分类，见 [rules.tool.ts](/opt/data/Wealth-Manager/src/tools/rules/rules.tool.ts:237)。即使当前哈希没覆盖 category，未来修复后这里也会破坏链。  
修复：事务包裹，写 correction log，提交后 `rebuildHashChain()`。

**轻微**

18. `delete_asset`、`update_asset_value`、`delete_recurring_task`、`update_reimbursement_status` 不检查 `changes`，不存在的 ID 也可能返回成功，见 [assets.tool.ts](/opt/data/Wealth-Manager/src/tools/assets/assets.tool.ts:164) 和 [automation.tool.ts](/opt/data/Wealth-Manager/src/tools/automation/automation.tool.ts:78)。修复：检查 `runAsync().changes === 1`。

19. `get_achievement` 在内存里设置 unlocked/progress 但不落库，见 [gamification.tool.ts](/opt/data/Wealth-Manager/src/tools/gamification/gamification.tool.ts:103)。修复：只读函数不要伪更新，或显式持久化。

20. WebDAV `filename` 未净化，可请求任意远端路径片段，见 [sync.tool.ts](/opt/data/Wealth-Manager/src/tools/webdav/sync.tool.ts:288)。修复：只允许 `sync_*.json` basename。

**总评**

当前 `src/tools/` 还停留在 MVP 工具层：参数校验分散、写入无事务、权限分级偏乐观、审计链覆盖不足、同步恢复风险很高。对财务 App 来说，最大风险不是 SQL 注入，当前参数化做得基本可以；真正的问题是数据一致性、误成功、超时重试、备份恢复和敏感数据外发。

建议优先级：

1. 先修执行管道：非幂等工具禁 retry，支持取消/幂等键，L2 确认统一由执行器 enforce。
2. 建立工具层通用 `validation + mapper + transaction` 模块，所有写工具迁移过去。
3. 修 WebDAV 恢复和导出权限，禁止完整内容出现在 tool result。
4. 重做哈希链字段覆盖和所有账单写路径。
5. 补测试：21 个工具文件至少都有基础测试；重点加事务失败、超时重试、同步恢复、权限确认、哈希链完整性测试。
Reading additional input from stdin...
OpenAI Codex v0.137.0
--------
workdir: /opt/data/Wealth-Manager
model: gpt-5.5
provider: codex
approval: never
sandbox: danger-full-access
reasoning effort: high
reasoning summaries: none
session id: 019e9beb-4b4c-7211-bbeb-8013c52c43f8
--------
user
你是代码审计专家。请对 Wealth-Manager 项目进行深度审计。

审计任务：审计 src/domain/ 目录下的领域模型：聚合根、仓储接口、领域事件，检查DDD实现是否正确

要求：
```

---

## 领域模型

```
**总评**

当前 `src/domain/` 更像 TypeScript 数据模型加少量行为，还没有形成足够强的 DDD 领域保护层。最大风险是财务不变量没有被聚合和值对象强制执行：金额、日期、ID、删除状态、还款、预算、规则事件都可能让错误数据进入核心账务系统。

建议优先改造顺序：

1. 先重做 `Money`、`LocalDate`、`IdGenerator` 三个基础值对象/服务。
2. 给 `Bill`、`Debt`、`BudgetPlan` 补齐强校验、版本、删除/完成状态。
3. 给所有聚合补 `toProps/fromProps`，禁止仓储绕过领域状态。
4. 引入事件 ID、聚合版本、事务性保存和幂等发布。
5. 对规则事件和仓储查询加隐私最小化、用户隔离和分页上限。

本次是静态代码审计，未运行 `tsc`、`eslint` 或测试。
tokens used
50,268
**审计范围**

已逐文件阅读 `src/domain/` 下 22 个文件：`shared`、`billing`、`budget`、`asset`、`automation`、`gamification`、`rules` 的聚合根、领域事件、仓储接口和导出文件。以下按严重程度排序。

**致命**

1. 金额模型允许负数，账单、预算、资产、债务、储蓄目标都可写入非法财务数据  
位置：[Money.ts](/opt/data/Wealth-Manager/src/domain/shared/Money.ts:5)、[Bill.ts](/opt/data/Wealth-Manager/src/domain/billing/aggregates/Bill.ts:75)、[BudgetPlan.ts](/opt/data/Wealth-Manager/src/domain/budget/aggregates/BudgetPlan.ts:37)、[Asset.ts](/opt/data/Wealth-Manager/src/domain/asset/aggregates/Asset.ts:26)

影响：`expense` 已经表达支出方向，若金额再为负数，会导致统计反向；负预算、负资产、负还款会直接污染财务数据。  
修复：按业务语义拆分金额工厂，默认禁止负数。

```ts
export class Money {
  private constructor(readonly amount: number, readonly currency = 'CNY') {}

  static nonNegative(amount: number, currency = 'CNY'): Money {
    if (!Number.isFinite(amount) || amount < 0) throw new Error('Amount must be non-negative');
    return new Money(Math.round(amount * 100) / 100, currency);
  }

  static positive(amount: number, currency = 'CNY'): Money {
    if (amount <= 0) throw new Error('Amount must be positive');
    return Money.nonNegative(amount, currency);
  }
}
```

2. 债务还款会静默吞掉超额还款，且负还款会增加债务  
位置：[Money.ts](/opt/data/Wealth-Manager/src/domain/shared/Money.ts:21)、[Asset.ts](/opt/data/Wealth-Manager/src/domain/asset/aggregates/Asset.ts:52)

影响：`subtract()` 用 `Math.max(0, ...)` 掩盖错误；`recordRepayment(-100)` 实际增加剩余债务。财务 App 不应静默修正账务异常。  
修复：在 `Debt` 聚合内校验业务规则，超额还款显式失败或拆分为本金还款和溢出处理。

```ts
recordRepayment(amount: number): void {
  const repayment = Money.positive(amount);
  if (repayment.amount > this._remaining.amount) {
    throw new Error('Repayment exceeds remaining debt');
  }
  this._remaining = this._remaining.subtractExact(repayment);
  this.addEvent(new DebtRepaidEvent(this.id, repayment.amount));
}
```

3. 领域事件缺少 `eventId`、版本、幂等键和原子发布契约  
位置：[DomainEvent.ts](/opt/data/Wealth-Manager/src/domain/shared/DomainEvent.ts:1)、[Repository.ts](/opt/data/Wealth-Manager/src/domain/shared/Repository.ts:1)

影响：账单保存成功但事件发布失败时，预算、分析、成就等上下文会永久不一致；重复发布也无法幂等去重。  
修复：事件必须有唯一 ID、聚合版本、schema 版本；仓储保存应与事件落库处于同一事务。

```ts
export abstract class DomainEvent {
  readonly eventId: string;
  readonly occurredAt = new Date().toISOString();
  readonly schemaVersion = 1;
  abstract readonly eventType: string;
  abstract readonly aggregateId: string;
  abstract readonly aggregateVersion: number;

  constructor(idGenerator: () => string = crypto.randomUUID) {
    this.eventId = idGenerator();
  }
}

export interface UnitOfWorkRepository<T> {
  save(entity: T, expectedVersion: number): Promise<readonly DomainEvent[]>;
}
```

**严重**

4. ID 使用 `Date.now()` 和 `Math.random()`，可预测且有碰撞风险  
位置：[Bill.ts](/opt/data/Wealth-Manager/src/domain/billing/aggregates/Bill.ts:86)、[BudgetPlan.ts](/opt/data/Wealth-Manager/src/domain/budget/aggregates/BudgetPlan.ts:91)

影响：高频导入、离线同步或并发写入时可能覆盖记录；可预测 ID 也不适合作为审计链路标识。  
修复：注入 `IdGenerator`，React Native 可在基础设施层用 `expo-crypto` 或平台 UUID。

```ts
interface IdGenerator { next(prefix: string): string }

static record(cmd: RecordBillCommand, ids: IdGenerator): Bill {
  const id = ids.next('bill');
  // ...
}
```

5. 日期只做字符串比较，非法日期和时区偏移会进入领域模型  
位置：[DateRange.ts](/opt/data/Wealth-Manager/src/domain/shared/DateRange.ts:6)、[Bill.ts](/opt/data/Wealth-Manager/src/domain/billing/aggregates/Bill.ts:79)、[Achievement.ts](/opt/data/Wealth-Manager/src/domain/gamification/aggregates/Achievement.ts:55)、[Asset.ts](/opt/data/Wealth-Manager/src/domain/asset/aggregates/Asset.ts:60)

影响：`2026-99-99`、`abc` 可通过；`toISOString().split('T')[0]` 使用 UTC，可能把本地今天记成昨天或明天。  
修复：建立 `LocalDate` 值对象，校验格式和真实日历日期，避免领域层直接使用 UTC 字符串。

```ts
export class LocalDate {
  private constructor(readonly value: string) {}

  static parse(value: string): LocalDate {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error('Invalid date format');
    const d = new Date(`${value}T00:00:00`);
    if (Number.isNaN(d.getTime()) || value !== d.toISOString().slice(0, 10)) {
      throw new Error('Invalid calendar date');
    }
    return new LocalDate(value);
  }
}
```

6. 账单聚合缺少核心不变量校验  
位置：[Bill.ts](/opt/data/Wealth-Manager/src/domain/billing/aggregates/Bill.ts:62)、[Bill.ts](/opt/data/Wealth-Manager/src/domain/billing/aggregates/Bill.ts:112)、[types.ts](/opt/data/Wealth-Manager/src/domain/billing/types.ts:17)

影响：运行时可传入非法 `type/source`、空分类、超长商户、未来日期、恶意文本；`tags` 数组引用可被外部修改。  
修复：在聚合构造和修改方法中统一规范化、长度限制、枚举校验，并返回 defensive copy。

```ts
private static requireText(v: string, field: string, max = 80): string {
  const s = v.trim();
  if (!s || s.length > max) throw new Error(`${field} is invalid`);
  return s;
}

modifyCategory(value: string): void {
  const next = Bill.requireText(value, 'category');
  // ...
}

get tags(): readonly string[] {
  return [...this._tags];
}
```

7. 删除账单只发事件，不改变聚合状态，可重复删除  
位置：[Bill.ts](/opt/data/Wealth-Manager/src/domain/billing/aggregates/Bill.ts:148)

影响：调用 `markDeleted()` 后聚合仍然像正常账单一样可保存、修改和再次删除，审计链会出现重复删除事件。  
修复：加入 `deletedAt` 状态和不变量保护。

```ts
markDeleted(now = new Date().toISOString()): void {
  if (this._deletedAt) throw new Error('Bill already deleted');
  this._deletedAt = now;
  this.addEvent(new BillDeletedEvent(this.id, this._amount.amount, this._category));
}

private assertActive(): void {
  if (this._deletedAt) throw new Error('Deleted bill cannot be modified');
}
```

8. 预算事件的 `aggregateId` 错误，且超预算事件从未发出  
位置：[BudgetPlan.ts](/opt/data/Wealth-Manager/src/domain/budget/aggregates/BudgetPlan.ts:39)、[BudgetPlan.ts](/opt/data/Wealth-Manager/src/domain/budget/aggregates/BudgetPlan.ts:49)

影响：`BudgetLimitSetEvent(category, category, amount)` 把分类当聚合 ID；`BudgetOverrunEvent` 定义后未使用，其他上下文无法响应超预算。  
修复：`BudgetPlan` 必须有 `id`，检查超预算时产生领域事件，且防止 `limit=0` 除零。

```ts
constructor(readonly id: string) { super(); }

setLimit(category: string, amount: number, period: BudgetPeriod): void {
  const limit = Money.positive(amount);
  this.addEvent(new BudgetLimitSetEvent(this.id, category, limit.amount));
}

checkOverrun(category: string, spent: number): BudgetStatus {
  // ...
  if (pct > 1) this.addEvent(new BudgetOverrunEvent(this.id, category, spent, limit.limit.amount));
}
```

9. 分类规则事件泄露完整 `facts`，可能包含商户、备注、金额等敏感财务信息  
位置：[ClassificationRule.ts](/opt/data/Wealth-Manager/src/domain/rules/aggregates/ClassificationRule.ts:3)、[ClassificationRule.ts](/opt/data/Wealth-Manager/src/domain/rules/aggregates/ClassificationRule.ts:35)

影响：事件通常会进入日志、持久化、调试面板或消息总线，直接扩大隐私数据暴露面。  
修复：事件只记录规则 ID、命中字段、置信度，不携带原始事实。

```ts
export class RuleMatchedEvent extends DomainEvent {
  readonly eventType = 'RuleMatched';
  constructor(
    readonly aggregateId: string,
    readonly matchedFields: string[],
    readonly confidence: number,
  ) { super(); }
}
```

10. 定时任务 cron 解析错误，普通 `* * * * *` 永远不会触发，且同一分钟可重复触发  
位置：[RecurringTask.ts](/opt/data/Wealth-Manager/src/domain/automation/aggregates/RecurringTask.ts:33)、[RecurringTask.ts](/opt/data/Wealth-Manager/src/domain/automation/aggregates/RecurringTask.ts:24)

影响：备份、报表、提醒可能失效或重复执行。  
修复：显式支持 `*`，校验范围，并用 `_lastTriggered` 防重。

```ts
private parsePart(part: string, min: number, max: number): number | '*' {
  if (part === '*') return '*';
  const n = Number(part);
  if (!Number.isInteger(n) || n < min || n > max) throw new Error('Invalid cron');
  return n;
}

shouldTrigger(now = new Date()): boolean {
  const slot = now.toISOString().slice(0, 16);
  return this._enabled && this.matchesCron(now) && this._lastTriggered?.slice(0, 16) !== slot;
}
```

**中等**

11. `Money` 使用浮点数保存金额，且不校验货币代码  
位置：[Money.ts](/opt/data/Wealth-Manager/src/domain/shared/Money.ts:2)、[Money.ts](/opt/data/Wealth-Manager/src/domain/shared/Money.ts:12)

影响：长期累计可能产生舍入误差；`CNY` 以外可传任意字符串。  
修复：内部保存最小货币单位整数。

```ts
export class Money {
  readonly minorUnits: number;
  constructor(amount: number, readonly currency = 'CNY') {
    if (!/^[A-Z]{3}$/.test(currency)) throw new Error('Invalid currency');
    this.minorUnits = Math.round(amount * 100);
  }
  get amount(): number { return this.minorUnits / 100; }
}
```

12. 多个聚合缺少 `toProps/fromProps`，状态重建不完整  
位置：[BudgetPlan.ts](/opt/data/Wealth-Manager/src/domain/budget/aggregates/BudgetPlan.ts:30)、[Asset.ts](/opt/data/Wealth-Manager/src/domain/asset/aggregates/Asset.ts:14)、[RecurringTask.ts](/opt/data/Wealth-Manager/src/domain/automation/aggregates/RecurringTask.ts:8)、[Achievement.ts](/opt/data/Wealth-Manager/src/domain/gamification/aggregates/Achievement.ts:8)、[ClassificationRule.ts](/opt/data/Wealth-Manager/src/domain/rules/aggregates/ClassificationRule.ts:19)

影响：仓储实现只能绕过私有字段或丢失状态，DDD 聚合边界会被基础设施层破坏。  
修复：每个聚合提供显式快照 DTO，并确保重建不产生领域事件。

```ts
toProps(): RecurringTaskProps { /* all fields */ }

static fromProps(props: RecurringTaskProps): RecurringTask {
  return new RecurringTask(props.id, props.name, props.type, props.cronExpression, props.enabled, props.lastTriggered, props.createdAt);
}
```

13. 仓储接口缺少用户/账户隔离、分页上限、乐观锁和事务语义  
位置：[BillRepository.ts](/opt/data/Wealth-Manager/src/domain/billing/repositories/BillRepository.ts:4)、[AssetRepository.ts](/opt/data/Wealth-Manager/src/domain/asset/repositories/AssetRepository.ts:3)、[ClassificationRuleRepository.ts](/opt/data/Wealth-Manager/src/domain/rules/repositories/ClassificationRuleRepository.ts:3)

影响：财务数据边界不清；`findAll()` 无限制可能拖垮本地数据库；并发更新可能丢失。  
修复：接口纳入 `ownerId/accountId`、`limit` 上限和 `expectedVersion`。

```ts
save(entity: Bill, options: { ownerId: string; expectedVersion: number }): Promise<void>;
search(criteria: BillSearchCriteria & { ownerId: string; limit: number }): Promise<Bill[]>;
```

14. 分类规则空条件、非法数值比较和动作缺少校验  
位置：[ClassificationRule.ts](/opt/data/Wealth-Manager/src/domain/rules/aggregates/ClassificationRule.ts:40)、[ClassificationRule.ts](/opt/data/Wealth-Manager/src/domain/rules/aggregates/ClassificationRule.ts:57)

影响：空 `and` 会抛异常，空 `or` 返回 `-Infinity` 置信度；`Number(undefined)`、`Number('')` 可能产生误匹配。  
修复：构造时校验条件和动作，数值比较只接受真实 number。

```ts
if (group.conditions.length === 0) throw new Error('Rule must have conditions');

private requireNumber(v: unknown): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error('Expected number');
  return v;
}
```

15. 成就和储蓄目标可被负数进度/负目标破坏，完成事件可重复  
位置：[Achievement.ts](/opt/data/Wealth-Manager/src/domain/gamification/aggregates/Achievement.ts:24)、[BudgetPlan.ts](/opt/data/Wealth-Manager/src/domain/budget/aggregates/BudgetPlan.ts:74)

影响：`addProgress(-10)` 会倒退；`maxProgress=0` 导致百分比异常；储蓄目标完成后继续贡献会重复发完成事件。  
修复：校验正数，并保存完成状态。

```ts
contribute(amount: number): void {
  const wasCompleted = this.isCompleted();
  this._currentAmount = this._currentAmount.add(Money.positive(amount));
  if (!wasCompleted && this.isCompleted()) {
    this.addEvent(new SavingsGoalCompletedEvent(this.id));
  }
}
```

16. `Streak` 没有 ID、没有仓储接口，日期算法受非法日期、回填和 DST 影响  
位置：[Achievement.ts](/opt/data/Wealth-Manager/src/domain/gamification/aggregates/Achievement.ts:38)

影响：无法作为聚合根可靠持久化；用户回填旧日期可能重置连续记录；`Date` 毫秒差在夏令时地区不稳定。  
修复：加入 `id` 和快照，用 `LocalDate` 做日历天差值，并定义是否允许补记。

**轻微**

17. 领域事件 payload 类型过宽，`BillModifiedEvent` 的 `field: string` 和 `unknown` 不利于审计  
位置：[Bill.ts](/opt/data/Wealth-Manager/src/domain/billing/aggregates/Bill.ts:19)

修复：用受限字段名和可序列化值。

```ts
type BillMutableField = 'amount' | 'category' | 'merchant' | 'note' | 'date' | 'type';
```

18. `DateRange.lastDays()` 未校验 `days`  
位置：[DateRange.ts](/opt/data/Wealth-Manager/src/domain/shared/DateRange.ts:27)

修复：限制为正整数并设置最大范围。

```ts
if (!Number.isInteger(days) || days <= 0 || days > 3660) throw new Error('Invalid range');
```

19. 导出文件本身无逻辑问题，但当前导出暴露了过多事件类  
位置：各 `index.ts`

建议：对 UI/API 层只导出聚合和仓储类型，事件可从应用服务或领域内部模块导出，避免外部随意构造领域事件。

**总评**

当前 `src/domain/` 更像 TypeScript 数据模型加少量行为，还没有形成足够强的 DDD 领域保护层。最大风险是财务不变量没有被聚合和值对象强制执行：金额、日期、ID、删除状态、还款、预算、规则事件都可能让错误数据进入核心账务系统。

建议优先改造顺序：

1. 先重做 `Money`、`LocalDate`、`IdGenerator` 三个基础值对象/服务。
2. 给 `Bill`、`Debt`、`BudgetPlan` 补齐强校验、版本、删除/完成状态。
3. 给所有聚合补 `toProps/fromProps`，禁止仓储绕过领域状态。
4. 引入事件 ID、聚合版本、事务性保存和幂等发布。
5. 对规则事件和仓储查询加隐私最小化、用户隔离和分页上限。

本次是静态代码审计，未运行 `tsc`、`eslint` 或测试。
Reading additional input from stdin...
OpenAI Codex v0.137.0
--------
workdir: /opt/data/Wealth-Manager
model: gpt-5.5
provider: codex
approval: never
sandbox: danger-full-access
reasoning effort: high
reasoning summaries: none
session id: 019e9bee-a06f-70e0-89fa-1e08fd437283
--------
user
你是代码审计专家。请对 Wealth-Manager 项目进行深度审计。

审计任务：审计 src/core/memory/ 目录下的记忆系统：嵌入、检索、分层存储、上下文管理，检查AI记忆实现

要求：
1. 逐文件阅读相关代码，不要跳过
2. 找出所有 bug、安全漏洞、性能问题、设计缺陷
3. 对每个问题给出具体的修复建议和代码示例
```

---

## 记忆系统

```
**总评**
当前记忆系统还不能按“财务 App 高安全记忆层”上线。核心风险是：云端脱敏失效、Agent 隔离缺失、删除不一致、本地加密假设不成立，以及嵌入/检索实现不自洽。优先修复顺序建议：先关闭云端 embedding 并加 PII gate；再强制 `agentId` 与级联删除；随后重做 vector schema/事务；最后补齐索引、过期逻辑和记忆投毒防护。测试至少新增：PII 不出云、跨 agent 不可召回、删除后 vector 不可命中、过期同日不可召回、`searchSemantic` 返回真实内容。
tokens used
156,507
**审计范围**
已逐文件阅读 `src/core/memory/` 下 11 个文件：`memory-engine`、`memory-manager`、`adaptive-context`、`embedding-service`、3 个 layer、2 个 retrieval、2 个 consolidation。并补读了 `vector-store`、数据库 schema、记忆工具和执行器。未做代码修改，未运行测试。

**致命**
1. 云端嵌入脱敏失效，会上传原始财务/PII 文本  
[embedding-service.ts](/opt/data/Wealth-Manager/src/core/memory/embedding/embedding-service.ts:67) 调 `sanitizeForCloud({ content })`，但 [sanitizer.ts](/opt/data/Wealth-Manager/src/core/cloud/sanitizer.ts:3) 只允许 `date/amount/category/type/period`，所以 `safeText` 回退为原文。更糟的是 [episodic-buffer.ts](/opt/data/Wealth-Manager/src/core/memory/layers/episodic-buffer.ts:64) 和 [semantic-store.ts](/opt/data/Wealth-Manager/src/core/memory/layers/semantic-store.ts:35) 默认都会尝试云端嵌入。  
修复：默认禁云；仅显式授权且 `detectPII` 通过后调用；使用 `sanitizeTextForCloud`。
```ts
const pii = detectPII(text);
if (!allowCloudEmbedding || pii.hasPII) return simpleEmbed(text, dim);
const safeText = sanitizeTextForCloud(text);
```

2. 记忆检索缺少强制 `agentId` 隔离，跨 Agent 泄露/污染  
[recallMemory](/opt/data/Wealth-Manager/src/core/memory/memory-engine.ts:104) 的 `agentId` 可选；[MemoryManager.recall](/opt/data/Wealth-Manager/src/core/memory/memory-manager.ts:47) 没传 agent；[hybrid-search.ts](/opt/data/Wealth-Manager/src/core/memory/retrieval/hybrid-search.ts:161) BM25 分支不按 agent/source 过滤；[listAiMemories](/opt/data/Wealth-Manager/src/core/memory/adaptive-context.ts:173) 全局列出长期/语义记忆。  
修复：所有查询入口必须要求 `agentId`，向量召回需 join `memory_engine` 校验归属。
```ts
export interface MemoryQueryParams { agentId: AgentId; /* required */ }

SELECT v.*, m.content
FROM vector_store v
JOIN memory_engine m ON m.id = v.source_id
WHERE m.agent_id = ? AND m.expires_at IS NULL OR m.expires_at > ?
```

3. 删除记忆不级联删除向量，已删记忆仍可被召回  
[forgetMemory](/opt/data/Wealth-Manager/src/core/memory/memory-engine.ts:169)、[cleanupExpired](/opt/data/Wealth-Manager/src/core/memory/consolidation/auto-refresh.ts:116)、[ageOutStale](/opt/data/Wealth-Manager/src/core/memory/layers/longterm-base.ts:181)、[compactLongterm](/opt/data/Wealth-Manager/src/core/memory/layers/longterm-base.ts:207)、[deleteAiMemory](/opt/data/Wealth-Manager/src/core/memory/adaptive-context.ts:220) 都可能只删 `memory_engine`。向量表没有 FK，[vector_store schema](/opt/data/Wealth-Manager/src/core/database/database.ts:199) 会留下幽灵索引。  
修复：集中实现事务删除。
```ts
await db.withTransactionAsync(async () => {
  await db.runAsync('DELETE FROM vector_store WHERE source_id = ?', [id]);
  await db.runAsync('DELETE FROM memory_engine WHERE id = ? AND agent_id = ?', [id, agentId]);
});
```

4. 本地“加密 SQLite”实现不可信，记忆原文裸存  
[database.ts](/opt/data/Wealth-Manager/src/core/database/database.ts:15) 仅执行 `PRAGMA key`，Expo SQLite 常规环境未必启用 SQLCipher；密钥来自 `EXPO_PUBLIC_...` 或硬编码默认值 [database.ts](/opt/data/Wealth-Manager/src/core/database/database.ts:21)，会进 JS bundle。`memory_engine.content/metadata` 都是明文。  
修复：密钥放系统 Keychain/Keystore，启动时注入；对记忆正文做字段级 AES-GCM 加密，禁止 fallback key。
```ts
if (!secureKey) throw new Error('Missing database encryption key');
content = await encryptField(params.content, secureKey);
```

**严重**
5. 嵌入实现前后不一致，云端 embedding 实际没被持久化  
[storeVector](/opt/data/Wealth-Manager/src/core/vector/vector-store.ts:77) 永远 `simpleEmbed`；但 `storeSemantic` 返回的是云端/归一化 embedding [semantic-store.ts](/opt/data/Wealth-Manager/src/core/memory/layers/semantic-store.ts:35)，两者不是同一向量。`useCloudEmbedding=true` 查询也会和本地向量空间不兼容。  
修复：`storeVector` 接收可选 embedding；存取同一模型、同一维度。
```ts
const embedding = params.embedding ?? simpleEmbed(params.text, dim);
```

6. `searchSemantic` 基本无法正确取回内容  
每个向量命中都调用 `recallMemory({ limit: 1 })` [semantic-store.ts](/opt/data/Wealth-Manager/src/core/memory/layers/semantic-store.ts:105)，然后找 `sourceId`，通常只会拿最新一条，导致返回 ID 代替内容 [semantic-store.ts](/opt/data/Wealth-Manager/src/core/memory/layers/semantic-store.ts:115)。category 也只作为 query bias，没有结果过滤。  
修复：一次性按命中 id 查询。
```ts
const ids = results.map(r => r.entry.sourceId);
SELECT * FROM memory_engine WHERE id IN (...) AND agent_id = ? AND tags LIKE ?
```

7. 过期判断使用 SQLite `datetime('now')` 与 ISO 字符串字典序比较，结果错误  
[recallMemory](/opt/data/Wealth-Manager/src/core/memory/memory-engine.ts:125) 和 [hybrid-search.ts](/opt/data/Wealth-Manager/src/core/memory/retrieval/hybrid-search.ts:164) 用 `expires_at > datetime('now')`，但存储是 ISO `2026-...T...Z`，同日过期可能仍被召回。  
修复：统一用 ISO 参数或 epoch 毫秒。
```ts
conditions.push('(expires_at IS NULL OR expires_at > ?)');
values.push(new Date().toISOString());
```

8. 记忆可作为 system prompt 注入，存在长期记忆投毒  
[buildAdaptiveContextPrompt](/opt/data/Wealth-Manager/src/core/memory/adaptive-context.ts:271) 把 persona、用户偏好、长期记忆直接拼进 system prompt；[upsertUserProfileMemory](/opt/data/Wealth-Manager/src/core/memory/adaptive-context.ts:112) 和 `memory_engine` 内容未做指令隔离。恶意记忆可长期影响财务操作。  
修复：用户/记忆内容放“非指令数据区”，并转义危险模式。
```ts
`## MEMORY_DATA_UNTRUSTED\n${items.map(x => `- ${JSON.stringify(x)}`).join('\n')}`
```

9. 输入验证不足，财务记忆可写入异常值/敏感原文  
[storeMemory](/opt/data/Wealth-Manager/src/core/memory/memory-engine.ts:75) 只校验长度；`importance` 不 clamp，`agentId/type/tags/metadata` 无运行时校验；`params.importance || 0.5` 会把合法 `0` 改成 `0.5` [memory-engine.ts](/opt/data/Wealth-Manager/src/core/memory/memory-engine.ts:85)。  
修复：
```ts
const content = params.content.trim();
const importance = Number.isFinite(params.importance)
  ? Math.min(1, Math.max(0, params.importance!))
  : 0.5;
```

10. `resetSession` 不更新底层 buffer 的 sessionId  
[MemoryManager.resetSession](/opt/data/Wealth-Manager/src/core/memory/memory-manager.ts:310) 只改 manager 字段并清空 buffer，`EpisodicBuffer` 内部仍是旧 sessionId [episodic-buffer.ts](/opt/data/Wealth-Manager/src/core/memory/layers/episodic-buffer.ts:31)，后续持久化会打旧 tag。  
修复：重建 buffer 或提供 setter。
```ts
this.episodic = new EpisodicBuffer(newSessionId, this.agentId);
```

**中等**
11. 性能不可扩展：记忆和向量全表/近似全表扫描  
`vector_store` 每次取最近 500 条再 JS 算相似度 [vector-store.ts](/opt/data/Wealth-Manager/src/core/vector/vector-store.ts:124)；BM25 每个 doc 内又全量算 docFreq [hybrid-search.ts](/opt/data/Wealth-Manager/src/core/memory/retrieval/hybrid-search.ts:189)，接近 O(N²)。`memory_engine` 缺少 `(agent_id, layer, type, importance)` 索引。  
修复：增加索引；关键词用 FTS5 或预计算 df。
```sql
CREATE INDEX IF NOT EXISTS idx_memory_agent_layer_type ON memory_engine(agent_id, layer, type, importance DESC);
CREATE INDEX IF NOT EXISTS idx_memory_expiry ON memory_engine(expires_at);
```

12. 多步写入无事务，容易产生半成品  
`storeSemantic` 先写 memory 再写 vector，vector 失败返回 null 但 memory 已存在 [semantic-store.ts](/opt/data/Wealth-Manager/src/core/memory/layers/semantic-store.ts:38)。摘要保存也绕过统一索引直接插 vector [summarizer.ts](/opt/data/Wealth-Manager/src/core/memory/consolidation/summarizer.ts:239)。  
修复：事务封装 memory+vector，失败回滚。

13. `recallMemory` 的访问计数异步 fire-and-forget  
[recallMemory](/opt/data/Wealth-Manager/src/core/memory/memory-engine.ts:142) map 内更新不等待，失败被吞；排序依赖 `access_count`，统计会漂移。  
修复：读取后批量 await。
```ts
await Promise.all(rows.map(r => db.runAsync('UPDATE ... WHERE id=?', [now, r.id])));
```

14. 工具权限设计与注册冲突  
`master` 最高 L0 [security-profile.ts](/opt/data/Wealth-Manager/src/agents/_shared/security-profile.ts:26)，但 `delete_ai_memory/update_ai_persona` 注册为 L1 且允许 master [init-tools.ts](/opt/data/Wealth-Manager/src/agents/_shared/init-tools.ts:1793)。执行器会拒绝 [tool-executor.ts](/opt/data/Wealth-Manager/src/tools/_pipeline/tool-executor.ts:143)，功能不可用；若绕过执行器则越权。  
修复：明确这些操作走 guardian 或提升/拆分权限，删除类至少 L2+确认。

**轻微**
15. `queryLongterm.offset` 未使用 [longterm-base.ts](/opt/data/Wealth-Manager/src/core/memory/layers/longterm-base.ts:99)。修复：SQL 加 `OFFSET ?`。  
16. `bm25Search(sourceType)` 两个 SQL 分支完全相同 [hybrid-search.ts](/opt/data/Wealth-Manager/src/core/memory/retrieval/hybrid-search.ts:161)。修复：真实过滤或删除参数。  
17. `upsertUserProfileMemory` 冲突更新时返回新 UUID，不是数据库已有 id [adaptive-context.ts](/opt/data/Wealth-Manager/src/core/memory/adaptive-context.ts:124)。修复：upsert 后按 key 重新 SELECT。  
18. `checkTokenBudget` 名为 monthly，但每天重置 [guard.ts](/opt/data/Wealth-Manager/src/core/safety/guard.ts:34)；`maxCallsPerHour` 未实现 [guard.ts](/opt/data/Wealth-Manager/src/core/safety/guard.ts:65)。修复：按年月或滚动窗口记录。

**总评**
当前记忆系统还不能按“财务 App 高安全记忆层”上线。核心风险是：云端脱敏失效、Agent 隔离缺失、删除不一致、本地加密假设不成立，以及嵌入/检索实现不自洽。优先修复顺序建议：先关闭云端 embedding 并加 PII gate；再强制 `agentId` 与级联删除；随后重做 vector schema/事务；最后补齐索引、过期逻辑和记忆投毒防护。测试至少新增：PII 不出云、跨 agent 不可召回、删除后 vector 不可命中、过期同日不可召回、`searchSemantic` 返回真实内容。
Reading additional input from stdin...
OpenAI Codex v0.137.0
--------
workdir: /opt/data/Wealth-Manager
model: gpt-5.5
provider: codex
approval: never
sandbox: danger-full-access
reasoning effort: high
reasoning summaries: none
session id: 019e9bf2-4f50-7e72-877f-6dfeecab35ff
--------
user
你是代码审计专家。请对 Wealth-Manager 项目进行深度审计。

审计任务：审计 src/core/cloud/ 目录下的云端模块：API调用、函数调用、提示词管理、同步加密，检查安全性

要求：
1. 逐文件阅读相关代码，不要跳过
2. 找出所有 bug、安全漏洞、性能问题、设计缺陷
3. 对每个问题给出具体的修复建议和代码示例
4. 按严重程度排序（致命 > 严重 > 中等 > 轻微）
5. 最后给出总评和改进建议
```

---

## 云端模块

```
**总评**

当前云端模块的最大问题不是 SQL 注入，而是隐私边界不清：云端 LLM、embedding、WebDAV 同步都可能处理财务敏感数据，但最小化上传、强脱敏、端点校验、密钥管理、同步包完整性和 prompt 完整性都不够强。建议优先修复致命 1-3，再补齐函数调用 schema 校验、prompt 事务/签名、WebDAV 原子合并和云端调用 allowlist。

本次是静态深度审计，未修改代码，也未运行测试。
tokens used
171,910
**审计范围**

已逐文件阅读 `src/core/cloud/` 下 7 个文件：`api.ts`、`function-calling.ts`、`sync-crypto.ts`、`sanitizer.ts`、`prompts/prompt-versioning.ts`、`prompts/prompt-builder.ts`、`prompts/agent-prompts.ts`。同时交叉检查了调用点：`master.agent.ts`、WebDAV 同步工具、embedding 服务、executor、安全档案和相关测试。

**致命**

1. 云端 LLM 会上传完整系统上下文、用户画像、记忆摘要和最近对话，脱敏不足  
位置：[api.ts](/opt/data/Wealth-Manager/src/core/cloud/api.ts:65)、[master.agent.ts](/opt/data/Wealth-Manager/src/agents/master/master.agent.ts:291)、[sanitizer.ts](/opt/data/Wealth-Manager/src/core/cloud/sanitizer.ts:23)  
`callCloudLLM` 对整段 prompt 做弱 regex 检测后仍上传完整 message；`master.agent.ts` 把 `adaptiveContext`、`recallRecentContext`、本地 NLU 参数、用户原文一起发云端。`sanitizeTextForCloud` 不识别姓名、地址、商户、债务对象、资产名称、单笔金额、日期组合等财务隐私。  
修复建议：云端只发送最小化、白名单字段，禁止发送 memory/context/rawDescription。  
```ts
const cloudPayload = sanitizeForCloud({
  date: intent.params.date,
  amount: intent.params.amount,
  category: intent.params.category,
  type: intent.params.type,
  period: intent.params.period,
});

const messages = [
  { role: 'system', content: CLOUD_SAFE_SYSTEM_PROMPT },
  { role: 'user', content: JSON.stringify(cloudPayload) },
];
```

2. embedding 服务实际会上传原文，`sanitizeForCloud({ content })` 被错误使用  
位置：[embedding-service.ts](/opt/data/Wealth-Manager/src/core/memory/embedding/embedding-service.ts:67)、[sanitizer.ts](/opt/data/Wealth-Manager/src/core/cloud/sanitizer.ts:13)  
`content` 不在 `ALLOWED_CLOUD_FIELDS`，所以 `sanitizedData.content` 永远为空，随后 `|| text` 回退为原始文本。这是明确的数据外传漏洞。  
修复建议：删除 fallback，或给 embedding 单独实现强脱敏策略；默认本地 embedding。  
```ts
const safeText = sanitizeTextForCloud(text);
if (detectPII(text).hasPII || safeText !== text) return simpleEmbed(text, dim);
```

3. WebDAV 配置密码用公开常量派生密钥加密，读到 DB 即可解密  
位置：[sync-crypto.ts](/opt/data/Wealth-Manager/src/core/cloud/sync-crypto.ts:29)、[sync.tool.ts](/opt/data/Wealth-Manager/src/tools/webdav/sync.tool.ts:17)、[sync.tool.ts](/opt/data/Wealth-Manager/src/tools/webdav/sync.tool.ts:60)  
`getPasswordStorageKey()` 是常量 + URL + username。攻击者拿到 SQLite 中的 `passwordCiphertext/passwordSalt/url/username` 后可直接派生同一密钥。  
修复建议：使用平台安全存储中的随机主密钥，不要从公开字段派生。  
```ts
const key = await SecureStore.getItemAsync('webdav_master_key')
  ?? randomBase64(32);
await SecureStore.setItemAsync('webdav_master_key', key);
const encrypted = await encryptPayload(config.password, key);
```

**严重**

4. `baseUrl` 未校验，API key 和财务 prompt 可被发往任意地址  
位置：[api.ts](/opt/data/Wealth-Manager/src/core/cloud/api.ts:127)、[api.ts](/opt/data/Wealth-Manager/src/core/cloud/api.ts:179)、[master.agent.ts](/opt/data/Wealth-Manager/src/agents/master/master.agent.ts:47)  
`setCloudApiConfig` 可设置任意 `baseUrl`，`resolveChatCompletionsUrl` 不限制 HTTPS、内网 IP、localhost 或可信域。  
修复建议：限制 scheme、host allowlist，拒绝内网和明文 HTTP。  
```ts
function assertAllowedCloudUrl(raw?: string): string {
  const url = new URL(raw ?? 'https://api.openai.com/v1');
  if (url.protocol !== 'https:' || !ALLOWED_HOSTS.has(url.hostname)) {
    throw new Error('Unsupported cloud endpoint');
  }
  return url.href.replace(/\/$/, '');
}
```

5. 云端 function calling 暴露了 master 实际无权执行的 L1 工具，设计和执行策略不一致  
位置：[function-calling.ts](/opt/data/Wealth-Manager/src/core/cloud/function-calling.ts:17)、[security-profile.ts](/opt/data/Wealth-Manager/src/agents/_shared/security-profile.ts:26)、[init-tools.ts](/opt/data/Wealth-Manager/src/agents/_shared/init-tools.ts:1795)  
`listToolsForAgent('master')` 会包含 `delete_ai_memory/update_ai_persona/...`，但 `master.maxPermissionLevel = 0`，executor 会拒绝 L1。结果是模型被提示可调用，但实际失败，且增加提示注入攻击面。  
修复建议：暴露工具前按安全档案过滤。  
```ts
const profile = getSecurityProfile('master');
const functions = toolsToOpenAIFunctions(
  listToolsForAgent('master').filter(t => t.definition.permissionLevel <= profile.maxPermissionLevel)
);
```

6. 工具参数 schema 太弱，未禁止额外字段，也未在执行前校验模型参数  
位置：[function-calling.ts](/opt/data/Wealth-Manager/src/core/cloud/function-calling.ts:23)、[master.agent.ts](/opt/data/Wealth-Manager/src/agents/master/master.agent.ts:365)、[tool-executor.ts](/opt/data/Wealth-Manager/src/tools/_pipeline/tool-executor.ts:53)  
schema 只有基础类型，没有 enum/range/min/max/`additionalProperties:false`；`executeToolCall` 只 `JSON.parse`，不验证 required/type/range。  
修复建议：function schema 和 executor 双层校验。  
```ts
parameters: {
  type: 'object',
  properties,
  required,
  additionalProperties: false,
}

validateToolParams(entry.definition, args); // 执行前强制校验
```

7. Prompt 版本切换非事务，失败或并发会导致没有 active prompt 或多 active prompt  
位置：[prompt-versioning.ts](/opt/data/Wealth-Manager/src/core/cloud/prompts/prompt-versioning.ts:50)、[prompt-versioning.ts](/opt/data/Wealth-Manager/src/core/cloud/prompts/prompt-versioning.ts:197)  
先 `UPDATE is_active=0` 再 `INSERT`；中途失败会让该 agent 没有 active prompt。并发保存也可能出现状态竞争。  
修复建议：使用事务和唯一 active 约束。  
```ts
await db.execAsync('BEGIN IMMEDIATE');
try {
  await db.runAsync('UPDATE prompt_versions SET is_active = 0 WHERE agent_id = ?', [agentId]);
  await db.runAsync('INSERT INTO prompt_versions (...) VALUES (...)', values);
  await db.execAsync('COMMIT');
} catch (e) {
  await db.execAsync('ROLLBACK');
  throw e;
}
```

8. Prompt 内容从 DB 直接作为 system prompt 使用，没有完整性校验  
位置：[agent-prompts.ts](/opt/data/Wealth-Manager/src/core/cloud/prompts/agent-prompts.ts:143)、[prompt-versioning.ts](/opt/data/Wealth-Manager/src/core/cloud/prompts/prompt-versioning.ts:24)  
如果 DB 被篡改，恶意 prompt 会成为最高优先级 system prompt。财务 App 应对 prompt 配置做签名或至少哈希校验。  
修复建议：存储 `prompt_hash/signature`，加载时验证。  
```ts
if (row.prompt_hash !== await sha256(row.prompt)) {
  return HARDCODED_PROMPTS[agentId];
}
```

9. WebDAV 下载 merge 缺少事务、业务 schema 校验和 hash chain 重建  
位置：[sync.tool.ts](/opt/data/Wealth-Manager/src/tools/webdav/sync.tool.ts:400)、[sync.tool.ts](/opt/data/Wealth-Manager/src/tools/webdav/sync.tool.ts:445)  
解密成功后可 `INSERT OR REPLACE` 多表数据；没有金额范围、枚举、日期、外键依赖顺序、hash/prev_hash 校验，部分失败会留下半合并状态。  
修复建议：先验证整包，再事务写入，最后重建/验证哈希链。  
```ts
await validateBackupSchema(backup);
await db.execAsync('BEGIN IMMEDIATE');
try {
  await mergeDataChecked(db, backup, strategy);
  await rebuildHashChain();
  await db.execAsync('COMMIT');
} catch {
  await db.execAsync('ROLLBACK');
  throw new Error('Sync merge failed atomically');
}
```

**中等**

10. token budget 名称是 monthly，但每天重置，且并发可超额  
位置：[api.ts](/opt/data/Wealth-Manager/src/core/cloud/api.ts:37)、[guard.ts](/opt/data/Wealth-Manager/src/core/safety/guard.ts:34)  
`resetDay` 只看日期，实际是“每日同日号变化即重置”；并发请求都先通过 `checkTokenBudget`，完成后才 `consumeTokens`。  
修复建议：用月份 key，并预留预算。  
```ts
const monthKey = new Date().toISOString().slice(0, 7);
if (budget.resetMonth !== monthKey) resetBudget();
reserveTokens(tokenBudget, estimatedTokens);
```

11. rate limit 参数 `maxCallsPerHour/windowMs` 未使用  
位置：[guard.ts](/opt/data/Wealth-Manager/src/core/safety/guard.ts:65)  
当前只有每分钟计数，调用方传的小时限制无效。  
修复建议：维护 minute/hour 两个窗口。  
```ts
if (minute.count >= limit.maxCallsPerMinute || hour.count >= limit.maxCallsPerHour) deny();
```

12. prompt builder 会把不可信 context/persona/userProfile 放进 system prompt，存在提示注入风险  
位置：[prompt-builder.ts](/opt/data/Wealth-Manager/src/core/cloud/prompts/prompt-builder.ts:72)、[master.agent.ts](/opt/data/Wealth-Manager/src/agents/master/master.agent.ts:294)  
历史对话和用户画像可能包含“忽略规则”等文本，被拼进 system 级内容。  
修复建议：用明确数据边界，并放入低优先级 message。  
```ts
messages.push({
  role: 'user',
  content: `<context-data>${escapePromptData(context)}</context-data>`
});
```

13. `truncateToTokenBudget` 可能截断安全约束和工具规则  
位置：[prompt-builder.ts](/opt/data/Wealth-Manager/src/core/cloud/prompts/prompt-builder.ts:142)  
当前按顺序累加，某个长 section 会直接截断；没有保证 constraints 永远保留。  
修复建议：安全规则固定保留，只截断 context/examples。  
```ts
const fixed = [system, constraints, tools].join('\n\n');
const contextBudget = maxTokens - estimateTokenCount(fixed);
```

14. `sanitizeForCloud` 把 number 全部转成 string，破坏结构化类型  
位置：[sanitizer.ts](/opt/data/Wealth-Manager/src/core/cloud/sanitizer.ts:17)  
`amount: 50` 变成 `'50'`，可能造成云端分类/函数调用参数类型漂移。  
修复建议：按字段保留类型并校验范围。  
```ts
if (key === 'amount' && typeof data.amount === 'number') filtered.amount = data.amount;
```

15. `SENSITIVE_PATTERNS` 使用全局 regex 配合 `.test()`，有状态 lastIndex 风险  
位置：[sanitizer.ts](/opt/data/Wealth-Manager/src/core/cloud/sanitizer.ts:5)、[sanitizer.ts](/opt/data/Wealth-Manager/src/core/cloud/sanitizer.ts:32)  
全局正则多次 `.test()` 可能跳过匹配。  
修复建议：移除 `g` 或每次重置。  
```ts
pattern.lastIndex = 0;
if (pattern.test(value)) return value.replace(pattern, '***');
```

16. `sync-crypto` 加密包没有版本、KDF 参数、AAD，salt 还由调用方分离保存  
位置：[sync-crypto.ts](/opt/data/Wealth-Manager/src/core/cloud/sync-crypto.ts:52)、[sync.tool.ts](/opt/data/Wealth-Manager/src/tools/webdav/sync.tool.ts:250)  
下载必须用户额外提供 salt，容易丢失；未来调整迭代次数也无法兼容。  
修复建议：输出 envelope JSON。  
```ts
return JSON.stringify({
  v: 1,
  kdf: { name: 'PBKDF2', iterations: PBKDF2_ITERATIONS, salt: b64(salt) },
  alg: 'AES-256-GCM',
  iv: b64(iv),
  ciphertext: b64(encrypted),
});
```

**轻微**

17. 普通和流式 LLM 调用没有 `AbortController` 超时  
位置：[api.ts](/opt/data/Wealth-Manager/src/core/cloud/api.ts:127)、[api.ts](/opt/data/Wealth-Manager/src/core/cloud/api.ts:274)  
网络悬挂会拖住 UI/任务。  
修复建议：  
```ts
const controller = new AbortController();
const timer = setTimeout(() => controller.abort(), 30000);
await fetch(url, { ...options, signal: controller.signal }).finally(() => clearTimeout(timer));
```

18. 流式接口可能重复 `done`，且 malformed chunk 被静默丢弃  
位置：[api.ts](/opt/data/Wealth-Manager/src/core/cloud/api.ts:315)、[api.ts](/opt/data/Wealth-Manager/src/core/cloud/api.ts:346)、[api.ts](/opt/data/Wealth-Manager/src/core/cloud/api.ts:363)  
`[DONE]` 时 yield done，循环结束后又 yield done。  
修复建议：设置 `doneEmitted`。  
```ts
if (jsonStr === '[DONE]') { doneEmitted = true; yield { type: 'done' }; return; }
```

19. `buildPrompt` 参数 `basePrompt/agentName` 基本未使用  
位置：[prompt-builder.ts](/opt/data/Wealth-Manager/src/core/cloud/prompts/prompt-builder.ts:11)、[prompt-builder.ts](/opt/data/Wealth-Manager/src/core/cloud/prompts/prompt-builder.ts:62)  
调用者以为可传自定义 base prompt，实际被默认层覆盖。  
修复建议：显式使用或删除参数，避免误导。  
```ts
const base = params.basePrompt || layers.system;
sections.push(resolve(base));
```

20. `loadActiveVersion()` 无 agentId 时只返回第一条 active prompt  
位置：[prompt-versioning.ts](/opt/data/Wealth-Manager/src/core/cloud/prompts/prompt-versioning.ts:109)  
函数签名像是可加载所有 active，但实际只取 `rows[0]`。  
修复建议：拆成 `loadActiveVersion(agentId)` 和 `loadAllActiveVersions()`。

**总评**

当前云端模块的最大问题不是 SQL 注入，而是隐私边界不清：云端 LLM、embedding、WebDAV 同步都可能处理财务敏感数据，但最小化上传、强脱敏、端点校验、密钥管理、同步包完整性和 prompt 完整性都不够强。建议优先修复致命 1-3，再补齐函数调用 schema 校验、prompt 事务/签名、WebDAV 原子合并和云端调用 allowlist。

本次是静态深度审计，未修改代码，也未运行测试。
Reading additional input from stdin...
OpenAI Codex v0.137.0
--------
workdir: /opt/data/Wealth-Manager
model: gpt-5.5
provider: codex
approval: never
sandbox: danger-full-access
reasoning effort: high
reasoning summaries: none
session id: 019e9bf6-e12e-7042-b054-ba4ad07b1602
--------
user
你是代码审计专家。请对 Wealth-Manager 项目进行深度审计。

审计任务：审计 src/core/rules/ 目录下的规则引擎：条件解析、规则学习、规则存储，检查规则系统的可扩展性

要求：
1. 逐文件阅读相关代码，不要跳过
2. 找出所有 bug、安全漏洞、性能问题、设计缺陷
3. 对每个问题给出具体的修复建议和代码示例
4. 按严重程度排序（致命 > 严重 > 中等 > 轻微）
5. 最后给出总评和改进建议
```

---

## 规则引擎

```
**总评**
规则系统目前能跑基础关键词分类，但还不适合作为财务 App 的可信自动化引擎。最需要先修的是：规则 schema 校验、`rules_apply` 只应用选中规则、`and` 语义修正、批量更新事务与审计、哈希覆盖分类字段、禁用或限制正则。完成这些后，再做规则版本化、索引、统一 DDD 模型和测试覆盖。

建议补充专门测试：`and` 部分命中不得执行、`ruleIds` 只应用指定规则、坏 JSON 不影响其他规则、恶意正则被拒绝、批量应用失败会回滚、规则更新/删除不存在 ID 返回失败。
tokens used
88,284
已逐文件审计 `src/core/rules/` 6 个文件，并追踪到 `src/tools/rules/rules.tool.ts`、工具注册、数据库建表和哈希链相关调用。

**致命**
1. [rules.tool.ts](/opt/data/Wealth-Manager/src/tools/rules/rules.tool.ts:198) `rules_apply` 选择了 `ruleIds`，但实际循环里调用 `matchRules()` 重新加载所有启用规则，`rulesToApply` 完全未被使用。用户指定只应用某条规则时，其他恶意/错误规则也会改账单分类。

修复方向：新增可传入规则集合的匹配函数，或在 `rules_apply` 内直接评估 `rulesToApply`。

```ts
const matchResults = matchRulesInMemory(
  rulesToApply,
  { merchant: bill.merchant, amount: bill.amount },
  { maxRulesPerMatch: 5, minConfidence: 0.3 }
);
```

2. [rules.tool.ts](/opt/data/Wealth-Manager/src/tools/rules/rules.tool.ts:237) 和 [rule-learner.ts](/opt/data/Wealth-Manager/src/core/rules/rule-learner.ts:148) 直接批量更新 `bills.category`，没有事务、没有变更审计、没有用户确认。更严重的是 [hashchain.ts](/opt/data/Wealth-Manager/src/core/hashchain/hashchain.ts:89) 的账单哈希根本不包含 `category`，所以规则系统可以静默篡改财务分类，哈希校验无法发现。

修复方向：分类应纳入哈希，批量更新后重建哈希链，并记录变更明细。

```ts
function computeBillHash(bill: BillRow, prevHash: string): string {
  const data = [
    bill.id, bill.date, bill.amount, bill.merchant,
    bill.type, bill.category, bill.note, bill.created_at, prevHash,
  ].join('|');
  return sha256(data);
}

await db.withTransactionAsync(async () => {
  await db.runAsync('UPDATE bills SET category = ? WHERE id = ?', [category, bill.id]);
  await insertRuleAudit(db, { ruleId, billId: bill.id, from, to: category });
});
await rebuildHashChain();
```

3. [rule-store.ts](/opt/data/Wealth-Manager/src/core/rules/rule-store.ts:271) / [rules.tool.ts](/opt/data/Wealth-Manager/src/tools/rules/rules.tool.ts:15) 没有校验规则 schema。任意 agent/user 可写入超深嵌套条件、灾难性正则、空动作、伪造 `createdBy: 'system'`、任意 category 字符串。财务分类规则属于高影响写操作，当前只校验了名称非空。

修复方向：入库前统一校验字段白名单、深度、条件数、字符串长度、动作类型和值域；外部调用禁止传 `createdBy`。

```ts
const ALLOWED_FIELDS = new Set(['merchant', 'amount', 'type', 'category', 'note']);
const ALLOWED_ACTIONS = new Set(['set_category', 'set_tag', 'flag_anomaly']);

function validateRuleInput(rule: { conditions: RuleConditionGroup; actions: RuleAction[] }) {
  validateGroup(rule.conditions, 0);
  if (!rule.actions.length || rule.actions.length > 5) throw new Error('invalid actions');
  for (const a of rule.actions) {
    if (!ALLOWED_ACTIONS.has(a.type)) throw new Error('invalid action');
    if (a.type === 'set_category' && typeof a.value !== 'string') throw new Error('invalid category');
  }
}

function validateGroup(group: RuleConditionGroup, depth: number) {
  if (depth > 5 || group.conditions.length > 50) throw new Error('rule too complex');
  for (const c of group.conditions) {
    if ('conditions' in c) validateGroup(c, depth + 1);
    else if (!ALLOWED_FIELDS.has(c.field)) throw new Error('invalid field');
  }
}
```

**严重**
4. [rule-engine.ts](/opt/data/Wealth-Manager/src/core/rules/rule-engine.ts:47) 对 `and` 规则使用“部分命中比例”作为置信度。两个条件的 `and` 规则只命中一个，`matchedCond / totalCond = 0.5`，默认 `minConfidence = 0.5` 时会被当成匹配并执行动作。这破坏了规则语义。

修复：

```ts
const groupResult = evaluateConditionGroup(rule.conditions, facts);
if (!groupResult) continue;

const totalCond = countConditions(rule.conditions);
const matchedCond = countMatchedConditions(rule.conditions, facts);
const confidence = Math.max(matchedCond / Math.max(totalCond, 1), 0.8);
```

5. [condition-parser.ts](/opt/data/Wealth-Manager/src/core/rules/condition-parser.ts:132) 每次匹配动态 `new RegExp()`，无长度限制、无复杂度限制、无缓存。用户规则可写入 `(a+)+$` 一类正则导致 ReDoS，匹配账单时阻塞 JS 线程。

修复方向：默认禁用正则，或只允许安全子集；限制长度并缓存编译结果。

```ts
if (String(expectedValue).length > 80) return false;
if (hasNestedQuantifier(String(expectedValue))) return false;
const re = regexCache.get(pattern) ?? new RegExp(pattern, 'i');
```

6. [rule-store.ts](/opt/data/Wealth-Manager/src/core/rules/rule-store.ts:363) `searchRules` 对每行 `JSON.parse`，任何一条损坏的规则都会让整个查询进入 `catch` 并返回空数组，等价于规则系统被单行数据 DoS。

修复：逐行解析，坏规则隔离并自动禁用。

```ts
const parsed: ClassificationRule[] = [];
for (const row of rows) {
  try {
    parsed.push(mapRuleRow(row));
  } catch (e) {
    await updateRule(row.id, { enabled: false });
    captureError('RuleStore.parseRule', e, `Invalid rule ${row.id}`);
  }
}
return parsed;
```

7. [rule-learner.ts](/opt/data/Wealth-Manager/src/core/rules/rule-learner.ts:45) 自动学习重复规则检测有 bug：搜索关键字是 `自动学习:${merchant}`，创建名称是 `自动学习: ${merchant} → ...`，冒号后多了空格，导致已有规则找不到，阈值达到后可能持续创建重复规则。

修复：不要用名称模糊匹配去判重，增加结构化字段或按条件+动作判重。

```ts
const existing = await findRuleBySignature({
  createdBy: 'agent',
  field: 'merchant',
  operator: 'contains',
  value: normalizeMerchant(params.merchant),
  category: params.correctedCategory,
});
```

8. [rules.tool.ts](/opt/data/Wealth-Manager/src/tools/rules/rules.tool.ts:231) 如果传入 `params.facts`，同一份 facts 会用于所有账单，可能把 200 笔账单按同一个商户/金额结果批量改成同类。工具注册参数里甚至没有声明 `facts`，实现和接口不一致。

修复：批量账单应用时禁止外部 facts，或只允许单账单调试模式。

```ts
if (params.facts && (!params.billIds || params.billIds.length !== 1)) {
  return { success: false, error: 'facts 只能用于单账单匹配' };
}
const facts = { merchant: bill.merchant, amount: bill.amount };
```

9. [rule-learner.ts](/opt/data/Wealth-Manager/src/core/rules/rule-learner.ts:166) `applyLearnedRules` 使用私有 `evaluateSimpleMatch`，只支持 `contains`，忽略 `and/or` 语义、大小写、其他操作符，与正式规则引擎不一致。规则扩展后自动学习路径会产生不同结果。

修复：删除 `evaluateSimpleMatch`，统一调用 `evaluateConditionGroup` 或 `matchRulesInMemory`。

**中等**
10. [condition-parser.ts](/opt/data/Wealth-Manager/src/core/rules/condition-parser.ts:203) `getFieldValue` 只支持一级字段，无法支持 `bill.merchant`、`counterparty.name` 等扩展场景；但未做字段白名单，外部 facts 又可以传任意 key。扩展性和安全边界都弱。

修复：字段白名单 + 安全路径读取。

```ts
function getFieldValue(field: string, facts: Record<string, unknown>) {
  if (!ALLOWED_FIELDS.has(field)) return undefined;
  return field.split('.').reduce<unknown>(
    (obj, key) => obj && typeof obj === 'object' ? (obj as Record<string, unknown>)[key] : undefined,
    facts
  );
}
```

11. [condition-parser.ts](/opt/data/Wealth-Manager/src/core/rules/condition-parser.ts:217) 数值比较会在无法转成数字时退化到字符串比较，例如金额字段和非数字字符串比较可能得到意外结果。财务金额应强类型比较，非法条件直接 false。

```ts
if (NUMERIC_FIELDS.has(condition.field)) {
  if (typeof factValue !== 'number' || typeof expectedValue !== 'number') return false;
}
```

12. [rule-store.ts](/opt/data/Wealth-Manager/src/core/rules/rule-store.ts:383) `updateRule` 和 [rule-store.ts](/opt/data/Wealth-Manager/src/core/rules/rule-store.ts:443) `deleteRule` 不检查 affected rows，传不存在的 ID 也返回成功，调用方会误以为规则已变更。

```ts
const result = await db.runAsync('DELETE FROM classification_rules WHERE id = ?', [id]);
return result.changes > 0;
```

13. [rule-store.ts](/opt/data/Wealth-Manager/src/core/rules/rule-store.ts:10) 表结构缺少 `CHECK`、索引、版本字段和规则唯一签名。`searchRules` 每次加载最多 200 条再 JSON parse，规则量增长后匹配性能线性恶化。

建议增加：

```sql
CREATE INDEX IF NOT EXISTS idx_rules_enabled_priority
ON classification_rules(enabled, priority DESC, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_rules_signature
ON classification_rules(created_by, name);
```

**轻微**
14. [condition-parser.ts](/opt/data/Wealth-Manager/src/core/rules/condition-parser.ts:35) `parseConditionExpr` 和 `conditionToString` 不可逆：`NOT(...)` 无法解析回来；`in` 数组里的数字不会转成 number；字段只允许 `\w+`。这会限制规则编辑器、导入导出和调试能力。

15. [domain/rules](/opt/data/Wealth-Manager/src/domain/rules/aggregates/ClassificationRule.ts:8) 另有一套 DDD 规则模型，操作符是 `neq`，而核心规则类型是 `ne`。当前核心规则引擎没有使用 DDD 聚合，未来迁移会出现语义分裂。

**总评**
规则系统目前能跑基础关键词分类，但还不适合作为财务 App 的可信自动化引擎。最需要先修的是：规则 schema 校验、`rules_apply` 只应用选中规则、`and` 语义修正、批量更新事务与审计、哈希覆盖分类字段、禁用或限制正则。完成这些后，再做规则版本化、索引、统一 DDD 模型和测试覆盖。

建议补充专门测试：`and` 部分命中不得执行、`ruleIds` 只应用指定规则、坏 JSON 不影响其他规则、恶意正则被拒绝、批量应用失败会回滚、规则更新/删除不存在 ID 返回失败。
Reading additional input from stdin...
OpenAI Codex v0.137.0
--------
workdir: /opt/data/Wealth-Manager
model: gpt-5.5
provider: codex
approval: never
sandbox: danger-full-access
reasoning effort: high
reasoning summaries: none
session id: 019e9bfa-0273-73e0-b23e-a3099e7fbe0b
--------
user
你是代码审计专家。请对 Wealth-Manager 项目进行深度审计。

审计任务：审计 src/ui/ 目录下的UI组件：聊天界面、卡片组件、图表、主题，检查前端代码质量和用户体验

要求：
1. 逐文件阅读相关代码，不要跳过
2. 找出所有 bug、安全漏洞、性能问题、设计缺陷
3. 对每个问题给出具体的修复建议和代码示例
4. 按严重程度排序（致命 > 严重 > 中等 > 轻微）
5. 最后给出总评和改进建议
```

---

## UI 组件

```
**总评**

`src/ui/` 的视觉结构已经成型，但财务级安全边界还不够：确认动作、日志暴露、WebView 沙箱、并发提交是优先级最高的四类问题。建议先做三件事：建立“待确认动作 registry + 一次性 token + 幂等 key”，生产环境隐藏并脱敏日志，给 EChartsSandbox 加白名单 schema 和网络阻断；随后补 UI 运行时数据校验和卡片渲染测试。
tokens used
119,378
**审计范围**

已逐文件阅读 `src/ui/` 下 18 个文件：`chat/`、`cards/`、`charts/`、`logger/`、`theme.ts`。未修改代码。验证时发现当前未安装 `node_modules`，`npx tsc --noEmit` 与 `npx jest --listTests` 均无法有效运行；且没有 UI 相关测试。

**致命**

未发现确定的“无需用户参与即可远程执行代码或直接销毁财务数据”的致命漏洞。但下面几项严重问题已经足以影响财务 App 的安全边界和数据一致性。

**严重**

1. 确认操作被降级为普通自然语言，确认链路不可信  
位置：[ChatScreen.tsx:81](/opt/data/Wealth-Manager/src/ui/chat/ChatScreen.tsx:81)、[ConfirmCard.tsx:40](/opt/data/Wealth-Manager/src/ui/cards/ConfirmCard.tsx:40)、[tool-executor.ts:149](/opt/data/Wealth-Manager/src/tools/_pipeline/tool-executor.ts:149)  
点击确认后调用 `handleSend("确认操作 ${actionId}")`，重新走 NLU/LLM，而不是执行已登记的待确认动作。风险是确认失败、误执行、被提示词/文本伪造绕过，且无法保证 actionId 与原始参数绑定。

修复示例：

```ts
// ChatScreen: 不把确认转成自然语言
const [pendingActions, setPendingActions] = useState<Record<string, PendingAction>>({});

const handleCardConfirm = async (actionId: string) => {
  const action = pendingActions[actionId];
  if (!action || action.consumed) return;
  setPendingActions((s) => ({ ...s, [actionId]: { ...action, consumed: true } }));
  await executeConfirmedAction({ ...action, confirmed: true });
};
```

2. 快捷栏和确认按钮可并发提交，可能重复记账/重复敏感操作  
位置：[ChatScreen.tsx:50](/opt/data/Wealth-Manager/src/ui/chat/ChatScreen.tsx:50)、[ChatScreen.tsx:162](/opt/data/Wealth-Manager/src/ui/chat/ChatScreen.tsx:162)、[RecordConfirmCard.tsx:88](/opt/data/Wealth-Manager/src/ui/cards/RecordConfirmCard.tsx:88)  
`InputBar` 被禁用时，`QuickBar` 和卡片按钮仍可触发 `handleSend`；`handleSend` 自身也不检查 `isProcessing`。财务写入必须防双击和防并发。

修复示例：

```ts
const processingRef = useRef(false);

const handleSend = useCallback(async (text: string) => {
  if (processingRef.current) return;
  processingRef.current = true;
  setIsProcessing(true);
  try {
    // process
  } finally {
    processingRef.current = false;
    setIsProcessing(false);
  }
}, []);

<QuickBar disabled={isProcessing} onQuickAction={handleSend} />
```

3. 日志页在生产界面直接暴露，支持复制完整日志  
位置：[ChatScreen.tsx:134](/opt/data/Wealth-Manager/src/ui/chat/ChatScreen.tsx:134)、[LogScreen.tsx:53](/opt/data/Wealth-Manager/src/ui/logger/LogScreen.tsx:53)、[logger.ts:91](/opt/data/Wealth-Manager/src/core/logger/logger.ts:91)  
财务 App 日志可能包含栈、账单 ID、工具参数、云端错误、路径或 token 片段。当前任何进入主界面的用户都能打开日志并复制全部。

修复示例：

```ts
const redact = (s: string) =>
  s.replace(/(token|password|secret|apiKey)=\S+/gi, '$1=***')
   .replace(/[0-9a-f-]{32,36}/gi, '[id]');

if (!__DEV__) return null;
// exportString 内对 message/detail 做 redact
```

4. WebView 图表沙箱边界不足，缺少外链/导航阻断  
位置：[EChartsSandbox.tsx:190](/opt/data/Wealth-Manager/src/ui/charts/EChartsSandbox.tsx:190)、[EChartsSandbox.tsx:196](/opt/data/Wealth-Manager/src/ui/charts/EChartsSandbox.tsx:196)、[sanitizer.ts:67](/opt/data/Wealth-Manager/src/ui/charts/sanitizer.ts:67)  
`originWhitelist={['*']}`，没有 `onShouldStartLoadWithRequest`，也没有 schema 白名单。ECharts 配置一旦出现 `image://http...`、外链资源或非预期 option，WebView 可能联网或导航。财务 App 图表应零网络。

修复示例：

```tsx
<WebView
  originWhitelist={['about:blank']}
  onShouldStartLoadWithRequest={(req) => req.url === 'about:blank'}
  allowFileAccess={false}
  allowUniversalAccessFromFileURLs={false}
  javaScriptCanOpenWindowsAutomatically={false}
/>
```

并把 sanitizer 改为按图表类型白名单校验字段，而不是黑名单正则扫描。

5. `ErrorUtils` 在 Web/部分运行时可能直接崩溃，且没有恢复全局 handler  
位置：[ChatScreen.tsx:33](/opt/data/Wealth-Manager/src/ui/chat/ChatScreen.tsx:33)  
`ErrorUtils.getGlobalHandler?.()` 仍会在 `ErrorUtils` 未定义时抛 `ReferenceError`。同时组件卸载不恢复全局 handler，重复挂载会叠加包装。

修复示例：

```ts
useEffect(() => {
  const eu = globalThis.ErrorUtils;
  if (!eu?.getGlobalHandler || !eu?.setGlobalHandler) return;
  const original = eu.getGlobalHandler();
  eu.setGlobalHandler((error, isFatal) => { /* log */ original(error, isFatal); });
  return () => eu.setGlobalHandler(original);
}, []);
```

**中等**

6. 金额显示规则错误，`refund` 被显示成负数  
位置：[BillCard.tsx:49](/opt/data/Wealth-Manager/src/ui/cards/BillCard.tsx:49)、[BillDetailCard.tsx:32](/opt/data/Wealth-Manager/src/ui/cards/BillDetailCard.tsx:32)、[RecordConfirmCard.tsx:42](/opt/data/Wealth-Manager/src/ui/cards/RecordConfirmCard.tsx:42)

```ts
function formatAmount(type: BillType, amount: number) {
  const sign = type === 'expense' ? '-' : '+';
  return `${sign}¥${Math.abs(amount).toFixed(2)}`;
}
```

7. 卡片组件对 Agent/工具返回数据缺少运行时防御，可能白屏  
位置：[BillCard.tsx:50](/opt/data/Wealth-Manager/src/ui/cards/BillCard.tsx:50)、[BillCard.tsx:60](/opt/data/Wealth-Manager/src/ui/cards/BillCard.tsx:60)、[SummaryCard.tsx:31](/opt/data/Wealth-Manager/src/ui/cards/SummaryCard.tsx:31)  
`amount.toFixed()`、`bill.tags.length`、`totalIncome.toFixed()` 都假设数据完全可信。Agent 输出或迁移数据一旦缺字段，聊天页会崩。

```ts
const money = Number.isFinite(Number(bill.amount)) ? Number(bill.amount) : 0;
const tags = Array.isArray(bill.tags) ? bill.tags : [];
```

8. 汇总卡进度条未 clamp，负数/异常值会误导财务判断  
位置：[SummaryCard.tsx:14](/opt/data/Wealth-Manager/src/ui/cards/SummaryCard.tsx:14)

```ts
const total = Math.max(0, income) + Math.max(0, expense);
const expensePct = total ? Math.min(100, Math.max(0, expense / total * 100)) : 0;
```

9. 图表数值边界会误导用户  
位置：[ChartCard.tsx:145](/opt/data/Wealth-Manager/src/ui/cards/ChartCard.tsx:145)、[ChartCard.tsx:263](/opt/data/Wealth-Manager/src/ui/cards/ChartCard.tsx:263)  
仪表盘未处理 `value > max`；热力图 `visualMap.max` 固定为 10，不适合金额。应从数据动态计算，并明确超预算状态。

10. 图表错误降级为空白或只写 console  
位置：[CardRenderer.tsx:49](/opt/data/Wealth-Manager/src/ui/cards/CardRenderer.tsx:49)、[ChartCard.tsx:306](/opt/data/Wealth-Manager/src/ui/cards/ChartCard.tsx:306)  
图表失败时用户看不到原因，财务分析会“静默缺失”。

```tsx
return <ErrorCard data={{ type:'error_card', errorCode:'CHART_ERR', message:'图表渲染失败', retryable:false }} />;
```

11. 图表性能成本高  
位置：[EChartsSandbox.tsx:39](/opt/data/Wealth-Manager/src/ui/charts/EChartsSandbox.tsx:39)、[EChartsSandbox.tsx:126](/opt/data/Wealth-Manager/src/ui/charts/EChartsSandbox.tsx:126)  
每个 WebView 都拼接完整 ECharts bundle HTML；`onError` 作为 effect 依赖也容易触发重复初始化。建议缓存完整 HTML 模板，`onError` 放 ref，或使用共享本地 HTML 资源。

12. sanitizer 有状态正则和未使用的安全函数  
位置：[sanitizer.ts:4](/opt/data/Wealth-Manager/src/ui/charts/sanitizer.ts:4)、[sanitizer.ts:107](/opt/data/Wealth-Manager/src/ui/charts/sanitizer.ts:107)、[EChartsSandbox.tsx:154](/opt/data/Wealth-Manager/src/ui/charts/EChartsSandbox.tsx:154)  
带 `g` 的正则 `.test()` 会改变 `lastIndex`，跨调用可能产生不稳定结果；`sanitizeJSONString` 定义后未用于注入脚本。更稳妥：

```ts
const js = `renderChart(${JSON.stringify(JSON.stringify(safeConfig))}); true;`;
```

**轻微**

13. 多处按钮缺少 `accessibilityRole` / `accessibilityLabel`  
位置：[InputBar.tsx:40](/opt/data/Wealth-Manager/src/ui/chat/InputBar.tsx:40)、[QuickBar.tsx:26](/opt/data/Wealth-Manager/src/ui/chat/QuickBar.tsx:26)、[LogScreen.tsx:140](/opt/data/Wealth-Manager/src/ui/logger/LogScreen.tsx:140)

14. 未知卡片类型直接空渲染，排查困难  
位置：[CardRenderer.tsx:123](/opt/data/Wealth-Manager/src/ui/cards/CardRenderer.tsx:123)  
建议渲染安全错误卡，并记录 sanitized type。

15. UI 卡片体系与 Agent 返回断裂  
位置：[master.agent.ts:214](/opt/data/Wealth-Manager/src/agents/master/master.agent.ts:214)  
`processMessage()` 当前只返回纯文本，没有填充 `ChatMessage.data`，所以账单卡、汇总卡、图表卡很可能无法在真实聊天流中出现。需要在工具结果到 UI 的映射层生成结构化卡片。

**总评**

`src/ui/` 的视觉结构已经成型，但财务级安全边界还不够：确认动作、日志暴露、WebView 沙箱、并发提交是优先级最高的四类问题。建议先做三件事：建立“待确认动作 registry + 一次性 token + 幂等 key”，生产环境隐藏并脱敏日志，给 EChartsSandbox 加白名单 schema 和网络阻断；随后补 UI 运行时数据校验和卡片渲染测试。
Reading additional input from stdin...
OpenAI Codex v0.137.0
--------
workdir: /opt/data/Wealth-Manager
model: gpt-5.5
provider: codex
approval: never
sandbox: danger-full-access
reasoning effort: high
reasoning summaries: none
session id: 019e9bfe-6515-7b02-bd5d-45abe04bf3b1
--------
user
你是代码审计专家。请对 Wealth-Manager 项目进行深度审计。

审计任务：审计 src/tools/_pipeline/tool-executor.ts 和 src/agents/_shared/ 下的共享基础设施，检查工具执行和Agent共享逻辑

要求：
1. 逐文件阅读相关代码，不要跳过
2. 找出所有 bug、安全漏洞、性能问题、设计缺陷
3. 对每个问题给出具体的修复建议和代码示例
4. 按严重程度排序（致命 > 严重 > 中等 > 轻微）
5. 最后给出总评和改进建议
```

---

## 共享基础设施

```
**总评**
当前共享基础设施的最大问题不是单个工具 bug，而是安全控制没有形成强制边界：权限、确认、审计、参数校验、超时都集中在 `executeTool`，但大量真实调用绕过它。对记账/财务 App 来说，应优先把“所有工具只能经统一执行器调用”作为第一阶段整改目标。

建议整改顺序：先封死 direct handler 调用并补审计 fail-closed；再加参数 schema、幂等键和 L2 confirmation token；随后修复记忆隔离、注册表不可变、WebDAV 事务导入。未运行测试，本次为只读审计。
tokens used
278,221
**审计范围**
已逐文件阅读：`src/tools/_pipeline/tool-executor.ts`、`src/agents/_shared/{index,tool-registry,security-profile,delegate,memory,init-tools}.ts`。另外抽查了 Agent 调用侧和代表性工具实现，用于验证风险是否可达。

**致命问题**
1. 统一执行器被大量绕过，权限、审计、超时、L2 确认形同旁路  
证据：[tool-executor.ts](/opt/data/Wealth-Manager/src/tools/_pipeline/tool-executor.ts:21) 实现了统一执行入口，但 Ledger/Analyst/Coach/Guardian 多处直接调用工具函数或 `tool.handler`，如 [ledger.agent.ts](/opt/data/Wealth-Manager/src/agents/ledger/ledger.agent.ts:74)、[ledger.agent.ts](/opt/data/Wealth-Manager/src/agents/ledger/ledger.agent.ts:265)、[guardian.agent.ts](/opt/data/Wealth-Manager/src/agents/guardian/guardian.agent.ts:223)、[analyst.agent.ts](/opt/data/Wealth-Manager/src/agents/analyst/analyst.agent.ts:308)。  
影响：写账单、导入、资产、债务、同步等操作可绕过审计日志、权限级别、超时和 L2 确认。财务 App 中这是核心控制面失效。  
修复示例：
```ts
export async function invokeTool(
  agentId: AgentId,
  toolName: string,
  params: Record<string, unknown>,
  userConfirmed = false
) {
  const entry = getTool(toolName);
  if (!entry) return { success: false, error: '工具不存在', errorCode: 'TOOL_NOT_FOUND' };
  return executeTool(entry, params, { agentId, userConfirmed });
}

// Agent 内禁止 tool.handler(...)
const result = await invokeTool('ledger', 'add_bill', { amount, type: 'expense', merchant });
```

2. 超时不会取消真实副作用，配合重试会造成重复记账/重复导入  
证据：[tool-executor.ts](/opt/data/Wealth-Manager/src/tools/_pipeline/tool-executor.ts:54) 使用 `Promise.race` 超时，但 handler 仍会继续执行；[executeWithRetry](/opt/data/Wealth-Manager/src/tools/_pipeline/tool-executor.ts:117) 会重试。大量非幂等工具被注册为 `retryable: true`、`idempotent: false`，如 `add_bill` [init-tools.ts](/opt/data/Wealth-Manager/src/agents/_shared/init-tools.ts:160)、`import_csv` [init-tools.ts](/opt/data/Wealth-Manager/src/agents/_shared/init-tools.ts:1350)、`sync_download` [init-tools.ts](/opt/data/Wealth-Manager/src/agents/_shared/init-tools.ts:1592)。  
影响：首个调用超时后实际写入成功，重试再写一次，造成重复账单、重复导入、资产/债务错账。  
修复示例：
```ts
if (entry.definition.retryable && !entry.definition.idempotent) {
  return { success: false, error: '非幂等工具禁止自动重试', errorCode: 'NON_IDEMPOTENT_RETRY_BLOCKED' };
}

// 写工具必须要求 idempotencyKey
if (!entry.definition.idempotent && typeof params.idempotencyKey !== 'string') {
  return { success: false, error: '缺少幂等键', errorCode: 'IDEMPOTENCY_KEY_REQUIRED' };
}
```

3. 共享记忆没有按 Agent 隔离，任意 Agent 可读/删其他 Agent 记忆  
证据：`saveMemory` 把 `agentId` 只塞进 JSON 内容 [memory.ts](/opt/data/Wealth-Manager/src/agents/_shared/memory.ts:38)，数据库 `memories` 表无 `agent_id` 字段 [database.ts](/opt/data/Wealth-Manager/src/core/database/database.ts:76)；`recallMemory` 完全未使用 `params.agentId` 过滤 [memory.ts](/opt/data/Wealth-Manager/src/agents/_shared/memory.ts:63)；`forgetMemory` 只按 id 删除 [memory.ts](/opt/data/Wealth-Manager/src/agents/_shared/memory.ts:117)。  
影响：Coach/Analyst/Ledger 之间可交叉读取、污染或删除记忆，可能泄露财务偏好、交易上下文、用户画像。  
修复示例：
```ts
// migration
ALTER TABLE memories ADD COLUMN agent_id TEXT NOT NULL DEFAULT 'master';
CREATE INDEX IF NOT EXISTS idx_memories_agent_type ON memories(agent_id, type, updated_at);

// save
INSERT INTO memories (id, agent_id, type, content, updated_at) VALUES (?, ?, ?, ?, ?);

// recall/delete
WHERE agent_id = ? AND type = ?
DELETE FROM memories WHERE id = ? AND agent_id = ?
```

4. 执行层没有参数 schema 校验，注册表参数只是提示词文本  
证据：[tool-executor.ts](/opt/data/Wealth-Manager/src/tools/_pipeline/tool-executor.ts:53) 直接把 `params` 传入 handler；`ToolDefinition.parameters` 没有运行时校验；许多 handler 接收 `any`，如 [init-tools.ts](/opt/data/Wealth-Manager/src/agents/_shared/init-tools.ts:227)、[init-tools.ts](/opt/data/Wealth-Manager/src/agents/_shared/init-tools.ts:1555)。  
影响：金额范围、日期格式、枚举、数组长度、WebDAV 路径、导入文本大小都无法在统一边界拦截。  
修复示例：
```ts
function validateParams(entry: ToolEntry, params: Record<string, unknown>) {
  for (const p of entry.definition.parameters) {
    const value = params[p.name];
    if (p.required && value === undefined) return `${p.name} 必填`;
    if (value !== undefined && typeof value !== p.type && p.type !== 'array') {
      return `${p.name} 类型错误`;
    }
  }
  return null;
}

const validationError = validateParams(entry, params);
if (validationError) return { success: false, error: validationError, errorCode: 'INVALID_PARAMS' };
```

**严重问题**
5. 审计日志失败被吞掉，且不与财务写入同事务  
证据：[logToolExecution](/opt/data/Wealth-Manager/src/tools/_pipeline/tool-executor.ts:170) catch 空处理；审计在 handler 完成后写入 [tool-executor.ts](/opt/data/Wealth-Manager/src/tools/_pipeline/tool-executor.ts:66)。  
影响：L1/L2 财务写入可能成功但无审计记录；崩溃时更明显。  
修复：L1/L2 fail-closed，写操作和审计状态放入事务；至少审计失败要返回 `AUDIT_FAILED`。

6. L2 确认只靠 `confirmed: true` 布尔值，未绑定用户、工具、参数和时效  
证据：[tool-executor.ts](/opt/data/Wealth-Manager/src/tools/_pipeline/tool-executor.ts:149)，调用侧从 args 读取 `confirmed === true` [master.agent.ts](/opt/data/Wealth-Manager/src/agents/master/master.agent.ts:373)。  
影响：模型或错误路由只要带 `confirmed:true` 就可尝试敏感操作。  
修复示例：
```ts
type Confirmation = { token: string; tool: string; paramsHash: string; expiresAt: string };

if (entry.definition.permissionLevel === 2) {
  const ok = await consumeConfirmationToken(options.confirmationToken, entry.definition.name, await hashParams(params));
  if (!ok) return deny('CONFIRMATION_REQUIRED');
}
```

7. 工具注册表全局可变且可被外部清空/覆盖  
证据：`registerTool` 静默覆盖 [tool-registry.ts](/opt/data/Wealth-Manager/src/agents/_shared/tool-registry.ts:14)，`getAllTools` 返回原始 `Map` [tool-registry.ts](/opt/data/Wealth-Manager/src/agents/_shared/tool-registry.ts:40)。测试也直接 `registry.clear()` [tool-registry.test.ts](/opt/data/Wealth-Manager/src/__tests__/shared/tool-registry.test.ts:33)。  
影响：任意模块可替换 handler 或放宽 allowedAgents。  
修复示例：
```ts
export function registerTool(entry: ToolEntry): void {
  if (toolRegistry.has(entry.definition.name)) {
    throw new Error(`Duplicate tool registration: ${entry.definition.name}`);
  }
  toolRegistry.set(entry.definition.name, Object.freeze(entry));
}

export function getAllTools(): ReadonlyMap<string, ToolEntry> {
  return new Map(toolRegistry);
}
```

8. Master 工具可见性和实际权限冲突  
证据：Master `maxPermissionLevel` 是 L0 [security-profile.ts](/opt/data/Wealth-Manager/src/agents/_shared/security-profile.ts:26)，但 `delete_ai_memory`、`update_ai_persona` 等 L1 又允许 `master` [init-tools.ts](/opt/data/Wealth-Manager/src/agents/_shared/init-tools.ts:1807)。`listToolsForAgent('master')` 会暴露给云端 function calling [master.agent.ts](/opt/data/Wealth-Manager/src/agents/master/master.agent.ts:286)，执行时再失败。  
影响：模型规划和执行不一致，增加错误调用和绕过冲动。  
修复：`listToolsForAgent` 应过滤有效权限，或提升为“可请求但不可执行”的显式模式。
```ts
return [...toolRegistry.values()].filter(e =>
  e.allowedAgents.includes(agentId) &&
  e.definition.permissionLevel <= getSecurityProfile(agentId).maxPermissionLevel
);
```

9. WebDAV 下载合并可能破坏本地数据，且注册为可重试  
证据：`sync_download` 是 L2 但 `retryable: true`、非幂等 [init-tools.ts](/opt/data/Wealth-Manager/src/agents/_shared/init-tools.ts:1580)；`mergeData` 的 `overwrite` 会逐表 `DELETE` 再逐行插入，非事务 [sync.tool.ts](/opt/data/Wealth-Manager/src/tools/webdav/sync.tool.ts:416)。  
影响：中途失败会留下半导入数据库；重试可能重复覆盖。  
修复：禁止重试，下载前创建本地快照，`withTransactionAsync` 包裹 merge，完成后验证 hash chain。

**中等问题**
10. `canWriteToMemory`、`canUseSkills` 等安全配置没有执行约束  
证据：字段定义在 [security-profile.ts](/opt/data/Wealth-Manager/src/agents/_shared/security-profile.ts:8)，但 `saveMemory` 不检查 [memory.ts](/opt/data/Wealth-Manager/src/agents/_shared/memory.ts:29)。  
修复：所有共享能力入口检查 profile。
```ts
if (!getSecurityProfile(params.agentId)?.canWriteToMemory) return null;
```

11. `executeTool` 不规范化 handler 返回值  
证据：[tool-executor.ts](/opt/data/Wealth-Manager/src/tools/_pipeline/tool-executor.ts:78) 直接 spread `result`。若 handler 返回 `undefined` 或非对象，结果结构损坏。  
修复：
```ts
const raw = await runHandler();
const result = raw && typeof raw === 'object' ? raw as ToolResult : { success: false, error: '工具返回格式错误' };
```

12. 查询 limit 未统一限制，负数可能变成无限查询  
证据：共享记忆 `Math.min(params.limit || 10, 50)` 对 `-1` 返回 `-1` [memory.ts](/opt/data/Wealth-Manager/src/agents/_shared/memory.ts:81)；账单搜索也直接用传入 limit [bills.tool.ts](/opt/data/Wealth-Manager/src/tools/bills/bills.tool.ts:179)。  
修复：
```ts
const limit = Math.max(1, Math.min(Number(params.limit) || 10, 50));
```

13. 审计参数哈希有弱 fallback，且大参数会阻塞  
证据：[tool-executor.ts](/opt/data/Wealth-Manager/src/tools/_pipeline/tool-executor.ts:206) crypto 失败后降级 FNV；`stableStringify` 对大 CSV/导入文本做完整序列化 [tool-executor.ts](/opt/data/Wealth-Manager/src/tools/_pipeline/tool-executor.ts:199)。  
修复：财务审计不要弱 hash fallback；限制参数大小，超大输入只 hash 截断摘要和长度。

14. 委派权限对未知 Agent 不健壮  
证据：`canDelegate` 直接访问 `sourceProfile.canDelegateTasks` [delegate.ts](/opt/data/Wealth-Manager/src/agents/_shared/delegate.ts:47)，`getCriticalRules` 也假设 profile 存在 [security-profile.ts](/opt/data/Wealth-Manager/src/agents/_shared/security-profile.ts:225)。  
修复：未知 Agent 显式拒绝，不抛运行时异常。

**轻微问题**
15. `Promise.race` 的 timeout 没有清理 timer  
证据：[tool-executor.ts](/opt/data/Wealth-Manager/src/tools/_pipeline/tool-executor.ts:56)。  
影响：高频工具调用下产生不必要计时器。  
修复：保存 timer id，handler 完成后 `clearTimeout(timer)`。

16. `extractNamespace` 以字符串规则分类，易漂移  
证据：[tool-registry.ts](/opt/data/Wealth-Manager/src/agents/_shared/tool-registry.ts:102)。  
修复：把 namespace 作为 `ToolDefinition` 字段注册，避免靠命名猜测。

**总评**
当前共享基础设施的最大问题不是单个工具 bug，而是安全控制没有形成强制边界：权限、确认、审计、参数校验、超时都集中在 `executeTool`，但大量真实调用绕过它。对记账/财务 App 来说，应优先把“所有工具只能经统一执行器调用”作为第一阶段整改目标。

建议整改顺序：先封死 direct handler 调用并补审计 fail-closed；再加参数 schema、幂等键和 L2 confirmation token；随后修复记忆隔离、注册表不可变、WebDAV 事务导入。未运行测试，本次为只读审计。
Reading additional input from stdin...
OpenAI Codex v0.137.0
--------
workdir: /opt/data/Wealth-Manager
model: gpt-5.5
provider: codex
approval: never
sandbox: danger-full-access
reasoning effort: high
reasoning summaries: none
session id: 019e9c03-d901-72d3-9622-c0694f4aee75
--------
user
你是代码审计专家。请对 Wealth-Manager 项目进行深度审计。

审计任务：审计安全性：检查 src/core/safety/、src/tools/security/、加密机制、输入验证，找出安全漏洞

要求：
1. 逐文件阅读相关代码，不要跳过
2. 找出所有 bug、安全漏洞、性能问题、设计缺陷
3. 对每个问题给出具体的修复建议和代码示例
4. 按严重程度排序（致命 > 严重 > 中等 > 轻微）
5. 最后给出总评和改进建议
```

---

## 安全性审计

```
**致命**
1. 本地数据库加密基本不可依赖  
位置：[database.ts](/opt/data/Wealth-Manager/src/core/database/database.ts:15)、[package.json](/opt/data/Wealth-Manager/package.json:21)  
`PRAGMA key` 只有 SQLCipher 构建才生效，当前依赖是普通 `expo-sqlite`，代码还使用 `EXPO_PUBLIC_WEALTH_MANAGER_DB_KEY` 和默认固定密钥。财务数据在设备备份、越狱/root、调试包中高概率明文暴露。  
修复：生产环境必须使用 SQLCipher/平台安全存储，禁止默认密钥启动。
```ts
function getDatabaseKey(): string {
  const key = process.env.WEALTH_MANAGER_DB_KEY;
  if (!key || key === 'development-only-wealth-manager-db-key') {
    throw new Error('Missing production database encryption key');
  }
  return key;
}
```
同时用真实加密 SQLite 方案验证：创建数据库后直接读取文件头，不能出现 `SQLite format 3`。

2. WebDAV 下载可用远端备份覆盖本地财务数据  
位置：[sync.tool.ts](/opt/data/Wealth-Manager/src/tools/webdav/sync.tool.ts:267)、[sync.tool.ts](/opt/data/Wealth-Manager/src/tools/webdav/sync.tool.ts:400)、[sync.tool.ts](/opt/data/Wealth-Manager/src/tools/webdav/sync.tool.ts:445)  
远端 JSON 只要能被解密/解析，就可 `INSERT OR REPLACE` 到 `bills/assets/debts` 等表。没有备份签名、schema 校验、金额/日期校验、事务、导入后哈希链重建。WebDAV 服务器或备份文件被替换后，可静默篡改账本。  
修复：同步包必须加签，导入前严格 schema 校验，整包事务导入，导入后重建并验证哈希链。
```ts
type BackupBill = { id:string; amount:number; type:'income'|'expense'|'refund'; date:string };

function assertBill(row: any): asserts row is BackupBill {
  if (!/^[\w-]{8,}$/.test(String(row.id))) throw new Error('bad id');
  if (!Number.isFinite(row.amount) || row.amount <= 0 || row.amount > 99999999) throw new Error('bad amount');
  if (!['income','expense','refund'].includes(row.type)) throw new Error('bad type');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(row.date)) throw new Error('bad date');
}
```

**严重**
3. 主记账路径绕过统一权限与审计管道  
位置：[ledger.agent.ts](/opt/data/Wealth-Manager/src/agents/ledger/ledger.agent.ts:74)、[tool-executor.ts](/opt/data/Wealth-Manager/src/tools/_pipeline/tool-executor.ts:21)  
Ledger 直接调用 `add_bill/search_bills/get_aggregation` 等工具，而不是 `executeTool`。结果是权限策略、L2 确认、超时审计、参数哈希审计无法覆盖主流程。  
修复：Agent 禁止直接 import 工具，全部通过 `executeTool`。
```ts
const entry = getTool('add_bill');
if (!entry) throw new Error('tool unavailable');
const result = await executeTool(entry, { amount, type:'expense', merchant, category }, {
  agentId: 'ledger',
  userConfirmed: false,
});
```

4. 工具执行器没有参数 schema 校验  
位置：[tool-executor.ts](/opt/data/Wealth-Manager/src/tools/_pipeline/tool-executor.ts:53)、[init-tools.ts](/opt/data/Wealth-Manager/src/agents/_shared/init-tools.ts:151)  
`ToolDefinition.parameters` 只是描述，没有运行时类型、范围、枚举、长度检查。`NaN`、`Infinity`、超大 `limit`、非法日期、超长字符串可进入工具和数据库。  
修复：在 `executeTool` 调 handler 前统一校验。
```ts
function requireMoney(v: unknown): number {
  if (typeof v !== 'number' || !Number.isFinite(v) || v <= 0 || v > 99999999) {
    throw new Error('invalid amount');
  }
  return Math.round(v * 100) / 100;
}
```

5. 哈希链不是防篡改机制，修复会覆盖证据  
位置：[hashchain.ts](/opt/data/Wealth-Manager/src/core/hashchain/hashchain.ts:24)、[hashchain.ts](/opt/data/Wealth-Manager/src/core/hashchain/hashchain.ts:133)、[security.tool.ts](/opt/data/Wealth-Manager/src/tools/security/security.tool.ts:190)  
哈希未使用 HMAC/设备密钥，攻击者改账单后可重算全链。`repair_hash_chain` 会把断裂链直接改成“正确”，等于销毁篡改证据。另一个 bug：哈希字段只覆盖 `id/date/amount/merchant/type/created_at`，不覆盖 `category/note/tags/source/raw_description`。  
修复：用 HMAC-SHA256 覆盖全部账单字段；修复前写入独立审计事件，不自动覆盖原 hash。
```ts
const canonical = JSON.stringify({
  id: bill.id, amount: bill.amount, type: bill.type, category: bill.category,
  merchant: bill.merchant, note: bill.note, tags: bill.tags,
  raw_description: bill.raw_description, date: bill.date, source: bill.source,
  created_at: bill.created_at, prevHash,
});
```

6. 多步财务写入没有事务，失败会产生半完成状态  
位置：[assets.tool.ts](/opt/data/Wealth-Manager/src/tools/assets/assets.tool.ts:208)、[debt.tool.ts](/opt/data/Wealth-Manager/src/tools/debt/debt.tool.ts:164)、[bills.tool.ts](/opt/data/Wealth-Manager/src/tools/bills/bills.tool.ts:216)  
资产转账先扣后加；债务还款先插 repayment 后改 debt；账单拆分插多条后改原账单。任一步失败都会造成账实不一致。  
修复：所有跨表/多语句写入用事务。
```ts
await db.withTransactionAsync(async () => {
  await db.runAsync('UPDATE assets SET amount = amount - ? WHERE id = ?', [amount, fromId]);
  await db.runAsync('UPDATE assets SET amount = amount + ? WHERE id = ?', [amount, toId]);
});
```

7. WebDAV 密码加密密钥可预测  
位置：[sync.tool.ts](/opt/data/Wealth-Manager/src/tools/webdav/sync.tool.ts:17)、[sync.tool.ts](/opt/data/Wealth-Manager/src/tools/webdav/sync.tool.ts:60)  
WebDAV 密码用 `SECRET_STORAGE_KEY:url:username` 派生，这些都是代码或配置里可见的值，不是秘密。拿到 SQLite 后可离线解密 WebDAV 密码。  
修复：密码应存平台 Keychain/Keystore；如果仍落库，必须由设备安全密钥加密。

**中等**
8. 导出接口把完整财务数据返回给调用链  
位置：[data.tool.ts](/opt/data/Wealth-Manager/src/tools/data/data.tool.ts:52)、[data.tool.ts](/opt/data/Wealth-Manager/src/tools/data/data.tool.ts:85)、[data.tool.ts](/opt/data/Wealth-Manager/src/tools/data/data.tool.ts:119)  
`csvContent/jsonContent/backupContent` 直接放在 `ToolResult.data`，上层如果接入 LLM/function result，可能把完整账单内容带入上下文或日志。  
修复：只返回 `filePath/rowCount/hash`，内容不回传。

9. CSV 公式注入  
位置：[data.tool.ts](/opt/data/Wealth-Manager/src/tools/data/data.tool.ts:129)  
`escapeCSV` 未处理以 `= + - @` 开头的单元格，导出的商户/备注在 Excel 打开可能执行公式。  
修复：
```ts
if (/^[=+\-@]/.test(value)) value = `'${value}`;
```

10. 云端安全策略可被自定义 `baseUrl` 绕过到非可信服务  
位置：[api.ts](/opt/data/Wealth-Manager/src/core/cloud/api.ts:127)、[api.ts](/opt/data/Wealth-Manager/src/core/cloud/api.ts:179)  
调用方可传任意 `baseUrl`，API Key、系统提示和脱敏后内容会发给该地址。  
修复：只允许明确白名单域名，并默认拒绝非 HTTPS/非可信主机。

11. 限流/额度逻辑有设计错误  
位置：[guard.ts](/opt/data/Wealth-Manager/src/core/safety/guard.ts:34)、[guard.ts](/opt/data/Wealth-Manager/src/core/safety/guard.ts:65)  
`monthlyLimit` 实际按“日期变化”每天重置；`RateLimit.windowMs/maxCallsPerHour` 没用，拒绝的请求也递增计数，可能导致持续锁死。  
修复：按年月维护额度周期；限流实现 minute/hour 两个窗口，拒绝请求不计成功用量。

**轻微**
12. 输入清洗不是安全边界  
位置：[security.tool.ts](/opt/data/Wealth-Manager/src/tools/security/security.tool.ts:140)、[sanitizer.ts](/opt/data/Wealth-Manager/src/core/cloud/sanitizer.ts:23)  
当前是正则删除 HTML/JS 片段，不能替代输出编码、schema 校验和上下文隔离。PII 检测也会漏银行卡带空格、护照、地址等。  
修复：输入只做长度/类型/格式校验；展示层做 escape；云端上传做字段级 allowlist + 更完整 PII 检测。

13. 图表 WebView 策略偏宽  
位置：[EChartsSandbox.tsx](/opt/data/Wealth-Manager/src/ui/charts/EChartsSandbox.tsx:159)、[EChartsSandbox.tsx](/opt/data/Wealth-Manager/src/ui/charts/EChartsSandbox.tsx:196)  
`originWhitelist=['*']` 且通过拼接 JS 注入配置。当前 sanitizer 降低了风险，但建议改为 `postMessage` 传 JSON，并关闭 WebView 文件/网络访问能力。

**总评**
项目有安全意识，但安全边界没有真正闭合：加密不可信、主工具链绕过审计、参数校验分散且不完整、同步导入缺少信任根、关键财务写入没有事务。对财务管理 App 来说，当前不建议作为生产级安全实现。

优先级建议：先修数据库真实加密与密钥管理；然后把所有工具调用收口到 `executeTool + schema validation + audit`；再重做 WebDAV 同步签名/校验/事务；最后把哈希链改成 HMAC 审计链，并禁止“修复”覆盖证据。
tokens used
169,818
**审计范围**
已逐文件阅读：`src/core/safety/*`、`src/tools/security/*`，并追踪到实际安全边界相关的数据库、哈希链、云端脱敏、WebDAV 同步、工具执行、主 Agent 调用链、账单/导入/导出/资产/债务工具与图表沙箱。

**致命**
1. 本地数据库加密基本不可依赖  
位置：[database.ts](/opt/data/Wealth-Manager/src/core/database/database.ts:15)、[package.json](/opt/data/Wealth-Manager/package.json:21)  
`PRAGMA key` 只有 SQLCipher 构建才生效，当前依赖是普通 `expo-sqlite`，代码还使用 `EXPO_PUBLIC_WEALTH_MANAGER_DB_KEY` 和默认固定密钥。财务数据在设备备份、越狱/root、调试包中高概率明文暴露。  
修复：生产环境必须使用 SQLCipher/平台安全存储，禁止默认密钥启动。
```ts
function getDatabaseKey(): string {
  const key = process.env.WEALTH_MANAGER_DB_KEY;
  if (!key || key === 'development-only-wealth-manager-db-key') {
    throw new Error('Missing production database encryption key');
  }
  return key;
}
```
同时用真实加密 SQLite 方案验证：创建数据库后直接读取文件头，不能出现 `SQLite format 3`。

2. WebDAV 下载可用远端备份覆盖本地财务数据  
位置：[sync.tool.ts](/opt/data/Wealth-Manager/src/tools/webdav/sync.tool.ts:267)、[sync.tool.ts](/opt/data/Wealth-Manager/src/tools/webdav/sync.tool.ts:400)、[sync.tool.ts](/opt/data/Wealth-Manager/src/tools/webdav/sync.tool.ts:445)  
远端 JSON 只要能被解密/解析，就可 `INSERT OR REPLACE` 到 `bills/assets/debts` 等表。没有备份签名、schema 校验、金额/日期校验、事务、导入后哈希链重建。WebDAV 服务器或备份文件被替换后，可静默篡改账本。  
修复：同步包必须加签，导入前严格 schema 校验，整包事务导入，导入后重建并验证哈希链。
```ts
type BackupBill = { id:string; amount:number; type:'income'|'expense'|'refund'; date:string };

function assertBill(row: any): asserts row is BackupBill {
  if (!/^[\w-]{8,}$/.test(String(row.id))) throw new Error('bad id');
  if (!Number.isFinite(row.amount) || row.amount <= 0 || row.amount > 99999999) throw new Error('bad amount');
  if (!['income','expense','refund'].includes(row.type)) throw new Error('bad type');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(row.date)) throw new Error('bad date');
}
```

**严重**
3. 主记账路径绕过统一权限与审计管道  
位置：[ledger.agent.ts](/opt/data/Wealth-Manager/src/agents/ledger/ledger.agent.ts:74)、[tool-executor.ts](/opt/data/Wealth-Manager/src/tools/_pipeline/tool-executor.ts:21)  
Ledger 直接调用 `add_bill/search_bills/get_aggregation` 等工具，而不是 `executeTool`。结果是权限策略、L2 确认、超时审计、参数哈希审计无法覆盖主流程。  
修复：Agent 禁止直接 import 工具，全部通过 `executeTool`。
```ts
const entry = getTool('add_bill');
if (!entry) throw new Error('tool unavailable');
const result = await executeTool(entry, { amount, type:'expense', merchant, category }, {
  agentId: 'ledger',
  userConfirmed: false,
});
```

4. 工具执行器没有参数 schema 校验  
位置：[tool-executor.ts](/opt/data/Wealth-Manager/src/tools/_pipeline/tool-executor.ts:53)、[init-tools.ts](/opt/data/Wealth-Manager/src/agents/_shared/init-tools.ts:151)  
`ToolDefinition.parameters` 只是描述，没有运行时类型、范围、枚举、长度检查。`NaN`、`Infinity`、超大 `limit`、非法日期、超长字符串可进入工具和数据库。  
修复：在 `executeTool` 调 handler 前统一校验。
```ts
function requireMoney(v: unknown): number {
  if (typeof v !== 'number' || !Number.isFinite(v) || v <= 0 || v > 99999999) {
    throw new Error('invalid amount');
  }
  return Math.round(v * 100) / 100;
}
```

5. 哈希链不是防篡改机制，修复会覆盖证据  
位置：[hashchain.ts](/opt/data/Wealth-Manager/src/core/hashchain/hashchain.ts:24)、[hashchain.ts](/opt/data/Wealth-Manager/src/core/hashchain/hashchain.ts:133)、[security.tool.ts](/opt/data/Wealth-Manager/src/tools/security/security.tool.ts:190)  
哈希未使用 HMAC/设备密钥，攻击者改账单后可重算全链。`repair_hash_chain` 会把断裂链直接改成“正确”，等于销毁篡改证据。另一个 bug：哈希字段只覆盖 `id/date/amount/merchant/type/created_at`，不覆盖 `category/note/tags/source/raw_description`。  
修复：用 HMAC-SHA256 覆盖全部账单字段；修复前写入独立审计事件，不自动覆盖原 hash。
```ts
const canonical = JSON.stringify({
  id: bill.id, amount: bill.amount, type: bill.type, category: bill.category,
  merchant: bill.merchant, note: bill.note, tags: bill.tags,
  raw_description: bill.raw_description, date: bill.date, source: bill.source,
  created_at: bill.created_at, prevHash,
});
```

6. 多步财务写入没有事务，失败会产生半完成状态  
位置：[assets.tool.ts](/opt/data/Wealth-Manager/src/tools/assets/assets.tool.ts:208)、[debt.tool.ts](/opt/data/Wealth-Manager/src/tools/debt/debt.tool.ts:164)、[bills.tool.ts](/opt/data/Wealth-Manager/src/tools/bills/bills.tool.ts:216)  
资产转账先扣后加；债务还款先插 repayment 后改 debt；账单拆分插多条后改原账单。任一步失败都会造成账实不一致。  
修复：所有跨表/多语句写入用事务。
```ts
await db.withTransactionAsync(async () => {
  await db.runAsync('UPDATE assets SET amount = amount - ? WHERE id = ?', [amount, fromId]);
  await db.runAsync('UPDATE assets SET amount = amount + ? WHERE id = ?', [amount, toId]);
});
```

7. WebDAV 密码加密密钥可预测  
位置：[sync.tool.ts](/opt/data/Wealth-Manager/src/tools/webdav/sync.tool.ts:17)、[sync.tool.ts](/opt/data/Wealth-Manager/src/tools/webdav/sync.tool.ts:60)  
WebDAV 密码用 `SECRET_STORAGE_KEY:url:username` 派生，这些都是代码或配置里可见的值，不是秘密。拿到 SQLite 后可离线解密 WebDAV 密码。  
修复：密码应存平台 Keychain/Keystore；如果仍落库，必须由设备安全密钥加密。

**中等**
8. 导出接口把完整财务数据返回给调用链  
位置：[data.tool.ts](/opt/data/Wealth-Manager/src/tools/data/data.tool.ts:52)、[data.tool.ts](/opt/data/Wealth-Manager/src/tools/data/data.tool.ts:85)、[data.tool.ts](/opt/data/Wealth-Manager/src/tools/data/data.tool.ts:119)  
`csvContent/jsonContent/backupContent` 直接放在 `ToolResult.data`，上层如果接入 LLM/function result，可能把完整账单内容带入上下文或日志。  
修复：只返回 `filePath/rowCount/hash`，内容不回传。

9. CSV 公式注入  
位置：[data.tool.ts](/opt/data/Wealth-Manager/src/tools/data/data.tool.ts:129)  
`escapeCSV` 未处理以 `= + - @` 开头的单元格，导出的商户/备注在 Excel 打开可能执行公式。  
修复：
```ts
if (/^[=+\-@]/.test(value)) value = `'${value}`;
```

10. 云端安全策略可被自定义 `baseUrl` 绕过到非可信服务  
位置：[api.ts](/opt/data/Wealth-Manager/src/core/cloud/api.ts:127)、[api.ts](/opt/data/Wealth-Manager/src/core/cloud/api.ts:179)  
调用方可传任意 `baseUrl`，API Key、系统提示和脱敏后内容会发给该地址。  
修复：只允许明确白名单域名，并默认拒绝非 HTTPS/非可信主机。

11. 限流/额度逻辑有设计错误  
位置：[guard.ts](/opt/data/Wealth-Manager/src/core/safety/guard.ts:34)、[guard.ts](/opt/data/Wealth-Manager/src/core/safety/guard.ts:65)  
`monthlyLimit` 实际按“日期变化”每天重置；`RateLimit.windowMs/maxCallsPerHour` 没用，拒绝的请求也递增计数，可能导致持续锁死。  
修复：按年月维护额度周期；限流实现 minute/hour 两个窗口，拒绝请求不计成功用量。

**轻微**
12. 输入清洗不是安全边界  
位置：[security.tool.ts](/opt/data/Wealth-Manager/src/tools/security/security.tool.ts:140)、[sanitizer.ts](/opt/data/Wealth-Manager/src/core/cloud/sanitizer.ts:23)  
当前是正则删除 HTML/JS 片段，不能替代输出编码、schema 校验和上下文隔离。PII 检测也会漏银行卡带空格、护照、地址等。  
修复：输入只做长度/类型/格式校验；展示层做 escape；云端上传做字段级 allowlist + 更完整 PII 检测。

13. 图表 WebView 策略偏宽  
位置：[EChartsSandbox.tsx](/opt/data/Wealth-Manager/src/ui/charts/EChartsSandbox.tsx:159)、[EChartsSandbox.tsx](/opt/data/Wealth-Manager/src/ui/charts/EChartsSandbox.tsx:196)  
`originWhitelist=['*']` 且通过拼接 JS 注入配置。当前 sanitizer 降低了风险，但建议改为 `postMessage` 传 JSON，并关闭 WebView 文件/网络访问能力。

**总评**
项目有安全意识，但安全边界没有真正闭合：加密不可信、主工具链绕过审计、参数校验分散且不完整、同步导入缺少信任根、关键财务写入没有事务。对财务管理 App 来说，当前不建议作为生产级安全实现。

优先级建议：先修数据库真实加密与密钥管理；然后把所有工具调用收口到 `executeTool + schema validation + audit`；再重做 WebDAV 同步签名/校验/事务；最后把哈希链改成 HMAC 审计链，并禁止“修复”覆盖证据。
Reading additional input from stdin...
OpenAI Codex v0.137.0
--------
workdir: /opt/data/Wealth-Manager
model: gpt-5.5
provider: codex
approval: never
sandbox: danger-full-access
reasoning effort: high
reasoning summaries: none
session id: 019e9c09-33a7-76e3-ae08-9ae919f4a11b
--------
user
你是代码审计专家。请对 Wealth-Manager 项目进行深度审计。

审计任务：审计测试覆盖率和测试质量：检查 src/__tests__/ 下的测试，找出未覆盖的关键路径

要求：
1. 逐文件阅读相关代码，不要跳过
2. 找出所有 bug、安全漏洞、性能问题、设计缺陷
3. 对每个问题给出具体的修复建议和代码示例
4. 按严重程度排序（致命 > 严重 > 中等 > 轻微）
5. 最后给出总评和改进建议
```

---

## 测试覆盖率

```
**总评**

当前测试体系不能支撑财务 App 的安全性要求。优先补三类测试：真实数据库初始化/迁移测试、账本写操作事务与哈希链集成测试、工具执行管线权限/确认/审计测试。随后补 WebDAV 加密同步、导入导出、资产债务、UI 图表 sanitizer。建议设置覆盖率门槛，至少先要求 `tools/core/infrastructure/domain` 的关键文件达到 80% statement/branch，并把 `database.test.ts` 这类 mock 被测模块的测试改成真实行为测试。
tokens used
436,337
**审计结论**

当前测试覆盖的主要是纯函数和 mock 后的 happy path。财务 App 最关键的真实数据库初始化、账本变更、哈希链、同步加密、审计日志、仓储、UI 图表沙箱基本没有有效覆盖。尝试运行 `npm test -- --coverage` 和 `npx tsc --noEmit` 失败，原因是工作区没有 `node_modules`，本地 Jest/TypeScript 不存在。

**致命**

1. 真实数据库初始化和加密没有被测试  
[database.test.ts](/opt/data/Wealth-Manager/src/__tests__/core/database.test.ts:1) 直接 mock 了被测的 `../../core/database/database`，所以 [database.ts](/opt/data/Wealth-Manager/src/core/database/database.ts:7) 的 `openDatabaseAsync`、`PRAGMA key`、DDL、seed、migration 都没执行。更严重的是 [database.ts](/opt/data/Wealth-Manager/src/core/database/database.ts:21) 在无环境变量时使用固定 `development-only-wealth-manager-db-key`，测试没有阻止生产环境落到弱密钥。

修复示例：
```ts
// database.ts
function getDatabaseKey(): string {
  const key = globalThis.process?.env?.EXPO_PUBLIC_WEALTH_MANAGER_DB_KEY;
  if (!key || key === 'development-only-wealth-manager-db-key') {
    throw new Error('Secure database key is required');
  }
  return key;
}
```
新增测试不要 mock 被测模块，只 mock `expo-sqlite` 并断言：
```ts
expect(mockDb.execAsync).toHaveBeenCalledWith(expect.stringContaining('PRAGMA key'));
expect(mockDb.execAsync).toHaveBeenCalledWith(expect.stringContaining('CREATE TABLE IF NOT EXISTS bills'));
```

2. 领域事件总线实际收不到事件  
[DomainEventBusImpl.ts](/opt/data/Wealth-Manager/src/infrastructure/events/DomainEventBusImpl.ts:18) 发布事件时 `from: 'system', to: 'broadcast'`，但订阅时挂在 [DomainEventBusImpl.ts](/opt/data/Wealth-Manager/src/infrastructure/events/DomainEventBusImpl.ts:64) 的 `system`。`messageBus` 的 broadcast 会排除发送者 [message-bus.ts](/opt/data/Wealth-Manager/src/core/message-bus/message-bus.ts:66)，因此订阅者不会收到领域事件。当前没有任何 DomainEventBus 测试。

修复示例：
```ts
await messageBus.publish({
  from: 'system' as AgentId,
  to: 'system' as AgentId,
  type: 'event',
  payload: { eventType: event.eventType, aggregateId: event.aggregateId, data: event },
});
```
新增测试：
```ts
const seen: DomainEvent[] = [];
const unsub = domainEventBus.subscribe(BillRecordedEvent, async e => seen.push(e));
await domainEventBus.publish(new BillRecordedEvent('b1', 10, 'expense', '餐饮', '午饭', '2026-06-06'));
expect(seen).toHaveLength(1);
unsub();
```

3. 账本变更关键路径缺少事务和哈希链覆盖  
[bills.tool.test.ts](/opt/data/Wealth-Manager/src/__tests__/tools/bills.tool.test.ts:30) 只测 `add_bill`、`search_bills`。未覆盖 [modify_bill/delete_bill/split_bill/refund_bill](/opt/data/Wealth-Manager/src/tools/bills/bills.tool.ts:71)。其中 `split_bill` 多次插入后才更新原账单，无事务 [bills.tool.ts](/opt/data/Wealth-Manager/src/tools/bills/bills.tool.ts:216)；`refund_bill` 插入退款但不生成或重建哈希链 [bills.tool.ts](/opt/data/Wealth-Manager/src/tools/bills/bills.tool.ts:245)；导入工具也直接写 `bills` 不生成哈希 [import.tool.ts](/opt/data/Wealth-Manager/src/tools/import/import.tool.ts:60)。

修复示例：
```ts
await db.withTransactionAsync(async () => {
  // insert/update/delete all rows
});
await rebuildHashChain();
```
新增测试应覆盖：拆分第二笔插入失败时整单回滚；退款后 `verifyHashChain()` 仍 valid；导入后每笔账单有 `hash/prev_hash`。

4. 审计日志执行管线未被覆盖且被大量绕过  
`executeTool()` 的权限、L2 确认、超时、审计日志完全没有测试 [tool-executor.ts](/opt/data/Wealth-Manager/src/tools/_pipeline/tool-executor.ts:21)。同时 Ledger/Guardian 等 agent 多数直接调用工具，例如 [ledger.agent.ts](/opt/data/Wealth-Manager/src/agents/ledger/ledger.agent.ts:74)，绕过 `executeTool()`，这会让“所有操作自动写入审计日志”的安全要求失效。

修复示例：
```ts
const entry = getTool('add_bill');
const result = await executeTool(entry!, params, { agentId: 'ledger', userConfirmed: false });
```
新增测试：
```ts
const result = await executeTool(l2Tool, {}, { agentId: 'guardian' });
expect(result.errorCode).toBe('CONFIRMATION_REQUIRED');
expect(mockDb.runAsync).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO audit_log'), expect.any(Array));
```

**严重**

5. Guardian 会把损坏的哈希链报告成“通过”  
[handleVerifyChain](/opt/data/Wealth-Manager/src/agents/guardian/guardian.agent.ts:261) 不读取 `result.data.valid`，只要工具 `success` 就返回“哈希链完整”。测试只 mock 了 `{ success: true }` [guardian.agent.test.ts](/opt/data/Wealth-Manager/src/__tests__/agents/guardian.agent.test.ts:32)，没有 invalid 场景。

修复示例：
```ts
const data = result.data as { valid: boolean; details?: string[] };
if (!data.valid) return `哈希链异常：${data.details?.[0] || '发现断裂'}`;
return '✅ 哈希链完整性验证通过，数据未被篡改。';
```

6. 云脱敏和图表 sanitizer 的全局正则会隔次漏检  
[cloud/sanitizer.ts](/opt/data/Wealth-Manager/src/core/cloud/sanitizer.ts:5) 与 [ui/charts/sanitizer.ts](/opt/data/Wealth-Manager/src/ui/charts/sanitizer.ts:4) 复用带 `g` 的正则并调用 `test()`，`lastIndex` 会导致连续相同敏感值第二次漏检。现有测试没有重复调用同类模式。

修复示例：
```ts
function safeTest(pattern: RegExp, value: string): boolean {
  pattern.lastIndex = 0;
  return pattern.test(value);
}
```
或移除 `g` 标志。新增测试：
```ts
expect(sanitizeForCloud({ category: '4111111111111111' }).category).toBe('***');
expect(sanitizeForCloud({ category: '4111111111111111' }).category).toBe('***');
```

7. 导出筛选参数未传入 SQL  
[export_csv](/opt/data/Wealth-Manager/src/tools/data/data.tool.ts:35) 和 [export_json](/opt/data/Wealth-Manager/src/tools/data/data.tool.ts:75) 构造了 `values`，但调用 `getAllAsync` 时没有传参。相关导出工具完全无测试。

修复示例：
```ts
await db.getAllAsync(
  `SELECT ... FROM bills ${where} ORDER BY date DESC LIMIT 1000`,
  values
);
```

8. WebDAV 同步缺少一致性测试  
[mergeData](/opt/data/Wealth-Manager/src/tools/webdav/sync.tool.ts:400) 的 overwrite 会逐表 `DELETE` 后逐行插入，没有事务；下载合并失败可能留下半合并状态。[list_sync_files](/opt/data/Wealth-Manager/src/tools/webdav/sync.tool.ts:499) 没有复用 `sanitizePathSegment`。WebDAV、AES-GCM、解密失败、覆盖回滚均无测试。

修复示例：
```ts
await db.withTransactionAsync(async () => {
  if (strategy === 'overwrite') await db.runAsync(`DELETE FROM ${table}`);
  // insert rows
});
```

9. 限流和 token budget 语义错误未被测试发现  
[checkRateLimit](/opt/data/Wealth-Manager/src/core/safety/guard.ts:65) 接收 `windowMs/maxCallsPerHour`，但实现硬编码 60000 且完全忽略小时限制。`TokenBudget` 名称是 monthly，却在 [guard.ts](/opt/data/Wealth-Manager/src/core/safety/guard.ts:34) 日期号变化时每天重置。

修复示例：
```ts
counter = { count: 0, resetAt: now + limit.windowMs };
// 增加 hourCounters，并按 3600000 窗口校验 maxCallsPerHour
```

10. 多个财务模型允许非法金额  
[BillingService.modifyBill](/opt/data/Wealth-Manager/src/application/BillingService.ts:42) 允许负数金额；[add_bill](/opt/data/Wealth-Manager/src/tools/bills/bills.tool.ts:16) 未检查 `Number.isFinite`，`Infinity` 可通过；[BudgetPlan.setLimit](/opt/data/Wealth-Manager/src/domain/budget/aggregates/BudgetPlan.ts:35) 与 [SavingsGoal.contribute](/opt/data/Wealth-Manager/src/domain/budget/aggregates/BudgetPlan.ts:74) 缺少正数约束。

修复示例：
```ts
if (!Number.isFinite(amount) || amount <= 0 || amount > 99999999) {
  throw new Error('金额必须在 0 ~ 99999999 之间');
}
```

**中等**

11. 资产/债务工具无测试且存在真实缺陷  
`add_credit_card` 插入资产 type 为 `信用卡` [debt.tool.ts](/opt/data/Wealth-Manager/src/tools/debt/debt.tool.ts:246)，但 assets 表 CHECK 不允许该值 [database.ts](/opt/data/Wealth-Manager/src/core/database/database.ts:116)。`transfer_asset` 两次 UPDATE 无事务 [assets.tool.ts](/opt/data/Wealth-Manager/src/tools/assets/assets.tool.ts:208)。`record_repayment` 允许超额还款记录全额，remaining 只 clamp 到 0 [debt.tool.ts](/opt/data/Wealth-Manager/src/tools/debt/debt.tool.ts:162)。

修复示例：
```ts
const actualRepayment = Math.min(params.amount, debt.remaining);
await db.withTransactionAsync(async () => {
  await db.runAsync('INSERT INTO repayments ...', [actualRepayment]);
  await db.runAsync('UPDATE debts SET remaining = ? ...', [debt.remaining - actualRepayment]);
});
```

12. 自动化快捷指令表缺失但函数返回成功  
[register_shortcut](/opt/data/Wealth-Manager/src/tools/automation/automation.tool.ts:103) 写 `shortcuts` 表，但数据库 DDL 没有创建该表。catch 后仍返回 `success: true` [automation.tool.ts](/opt/data/Wealth-Manager/src/tools/automation/automation.tool.ts:119)，测试只 mock agent 层，没有测持久化。

修复示例：
```sql
CREATE TABLE IF NOT EXISTS shortcuts (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  action TEXT NOT NULL,
  icon TEXT DEFAULT '',
  created_at TEXT NOT NULL
);
```
catch 应返回 `success:false`，除非确实有内存 fallback 可查询。

13. 统计/预算覆盖不足且存在性能风险  
[stats.tool.test.ts](/opt/data/Wealth-Manager/src/__tests__/tools/stats.tool.test.ts:12) 只测 `get_aggregation`，未测 `get_budget_status/get_net_balance/generate_chart_config/get_anomaly_report/...`。[budget.tool.test.ts](/opt/data/Wealth-Manager/src/__tests__/tools/budget.tool.test.ts:17) 只测 2/5 个导出函数。`update_savings_progress` 在每个 goal 循环里重复查询总支出 [budget.tool.ts](/opt/data/Wealth-Manager/src/tools/budget/budget.tool.ts:178)。

修复示例：
```ts
const expenseResult = await db.getFirstAsync(...); // 移到 for 外
for (const goal of goals) { ... }
```

14. UI 与图表沙箱没有测试  
`src/ui/**` 无测试。尤其 [EChartsSandbox.tsx](/opt/data/Wealth-Manager/src/ui/charts/EChartsSandbox.tsx:159) 使用 `injectJavaScript` 注入配置字符串，必须有 sanitizer 单测和组件级错误路径测试。

修复示例：为 `sanitizeChartConfig` 增加恶意配置、深度、大小、重复扫描测试；为 `EChartsSandbox` mock WebView，断言 invalid config 不会调用 `injectJavaScript`。

**轻微/测试质量**

15. 测试大量 mock 掉真实行为  
例如 [ledger.agent.test.ts](/opt/data/Wealth-Manager/src/__tests__/agents/ledger.agent.test.ts:17)、[guardian.agent.test.ts](/opt/data/Wealth-Manager/src/__tests__/agents/guardian.agent.test.ts:4)、[proactive.tool.test.ts](/opt/data/Wealth-Manager/src/__tests__/tools/proactive.tool.test.ts:17) 都 mock 掉下游工具，适合单元测试，但缺少集成测试补位。

16. 部分测试复制实现而非测试实现  
[ledger.agent.test.ts](/opt/data/Wealth-Manager/src/__tests__/agents/ledger.agent.test.ts:239) 的分类测试复制了一份 `guessCategory` 逻辑，没有断言 `add_bill` 实际收到的 `category`。应改为：
```ts
await handleIntent({ intent: 'add_expense', params: { amount: 35, merchant: '午饭' }, confidence: 1, agent: 'ledger' });
expect(add_bill).toHaveBeenCalledWith(expect.objectContaining({ category: '餐饮' }));
```

**总评**

当前测试体系不能支撑财务 App 的安全性要求。优先补三类测试：真实数据库初始化/迁移测试、账本写操作事务与哈希链集成测试、工具执行管线权限/确认/审计测试。随后补 WebDAV 加密同步、导入导出、资产债务、UI 图表 sanitizer。建议设置覆盖率门槛，至少先要求 `tools/core/infrastructure/domain` 的关键文件达到 80% statement/branch，并把 `database.test.ts` 这类 mock 被测模块的测试改成真实行为测试。
Reading additional input from stdin...
OpenAI Codex v0.137.0
--------
workdir: /opt/data/Wealth-Manager
model: gpt-5.5
provider: codex
approval: never
sandbox: danger-full-access
reasoning effort: high
reasoning summaries: none
session id: 019e9c15-5678-7260-ad11-20d49a22f3cd
--------
user
你是代码审计专家。请对 Wealth-Manager 项目进行深度审计。

审计任务：审计整个项目的架构设计、模块划分、依赖关系是否合理，找出架构层面的问题

要求：
1. 逐文件阅读相关代码，不要跳过
2. 找出所有 bug、安全漏洞、性能问题、设计缺陷
3. 对每个问题给出具体的修复建议和代码示例
4. 按严重程度排序（致命 > 严重 > 中等 > 轻微）
5. 最后给出总评和改进建议

注意：这是记账/财务管理App，安全性要求高，特别关注数据一致性、输入验证、加密安全。
codex
我会先建立项目文件清单和架构地图，然后按层读取关键实现与测试覆盖，最后把架构级问题按严重程度整理成审计报告。重点会放在本地数据库、加密、仓储/事件边界、Agent 工具调用和输入校验路径。
  → Inventory project files and config
  • Read architecture docs and dependency boundaries
  • Audit core database/security/data paths
  • Audit domain/application/infra consistency
  • Audit agents/tools/UI integration risks
```

---

## 🎯 整改优先级建议

### 第一阶段：立即修复（致命）
1. **数据库真实加密** — 替换 expo-sqlite 为 SQLCipher，禁止默认密钥启动
2. **WebDAV 同步签名校验** — 同步包必须加签，导入前严格 schema 校验，整包事务导入
3. **云端 LLM 禁止接收财务上下文** — 默认关闭云端数据上传，需要显式授权
4. **Prompt 注入防护** — 所有 prompt 变量做严格转义和长度限制

### 第二阶段：架构整改（严重）
5. **工具调用统一收口** — 禁止直接 import 工具，全部通过 executeTool + schema validation + audit
6. **多步写入事务保护** — 资产转账/债务还款/账单拆分全部用事务
7. **参数 schema 校验** — 在 executeTool 层统一校验类型、范围、枚举
8. **哈希链改 HMAC** — 覆盖全部账单字段，禁用 repair 覆盖证据
9. **Agent 隔离** — 每个 Agent 独立的工具白名单和安全档案

### 第三阶段：加固完善（中等）
10. **记忆系统 PII gate** — 关闭云端 embedding，强制 agentId 级联删除
11. **规则引擎 schema 校验** — 禁用正则，修复 and 语义，批量更新事务
12. **UI 确认机制** — 待确认动作 registry + 一次性 token + 幂等 key
13. **导出脱敏** — 只返回 filePath/rowCount/hash，不回传完整内容
14. **限流/额度修复** — 按年月维护额度周期，拒绝请求不计成功用量

### 第四阶段：测试补全
15. 补充真实数据库初始化/迁移测试
16. 补充账本写操作事务与哈希链集成测试
17. 补充工具执行管线权限/确认/审计测试
18. 设置覆盖率门槛：核心模块 80% statement/branch

---

## 📊 审计统计

- **总 token 消耗**: ~2,200,000+
- **审计模块**: 12 个（每模块循环审计 2-3 轮）
- **审计时间**: ~65 分钟
- **文件覆盖**: 130/130 (100%)

> 本报告由 Codex CLI (gpt-5.5) 自动生成，基于逐文件静态代码审计。
