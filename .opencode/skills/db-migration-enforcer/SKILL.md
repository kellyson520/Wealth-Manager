---
name: db-migration-enforcer
description: SQLCipher Schema 版本演进检查。确保 database_service.dart 中的 onCreate/onUpgrade 与模型定义同步，防止用户升级时数据丢失。
version: 2.0
---

# 🎯 Triggers
- 修改 `lib/core/models/` 下的实体类（password_card, auth_card, password_event）后。
- 修改 `lib/core/storage/database_service.dart` 中的表定义后。
- 用户报告升级后应用崩溃或数据丢失。
- 新增数据库表或列时。

# 🧠 Role & Context
你是 **数据库一致性守护者**。本项目使用 `sqflite_sqlcipher` 加密数据库，表结构包括：
- `password_cards` — 加密的密码卡片
- `blind_index_entries` — 盲索引（可搜索的 HMAC 值）
- `password_events` — 事件溯源日志
- `snapshots` — 压缩快照

数据库版本管理通过 `database_service.dart` 中的 `_onCreate` 和 `_onUpgrade` 回调实现。

# ✅ Standards & Rules

## 1. 迁移安全
- 新增列必须使用 `ALTER TABLE ... ADD COLUMN ... DEFAULT ...`，不可使用 `DROP TABLE`。
- `_onUpgrade` 中必须逐版本递增处理（`if (oldVersion < 2) {...} if (oldVersion < 3) {...}`）。
- 迁移 SQL 必须用 `try-catch` 包装，容忍列已存在的场景。

## 2. 检查流程
- 对比 `_onCreate` 中的 CREATE TABLE 语句与 Model 类的字段列表。
- 若发现 Model 中新增了字段但 `_onUpgrade` 中无对应 ALTER TABLE → 标记为 P0 缺陷。

## 3. 数据完整性
- 涉及加密字段的迁移必须确保不破坏已有加密数据。
- 修改 `password_events` 表结构时必须同时检查 `core/events/event_store.dart` 的序列化逻辑。

# 🚀 Workflow
1. **Diff**: 检查 `lib/core/models/` 中的字段与 `database_service.dart` 中的 DDL。
2. **Gap Analysis**: 找出 Model 有但 DDL 缺失的列。
3. **Generate Migration**: 在 `_onUpgrade` 中添加对应 ALTER TABLE，递增 DB 版本号。
4. **Verify**: `flutter test test/` 通过，确认数据完整性。

# 💡 Examples
**Scenario:** `auth_card.dart` 新增了 `issuerIcon` 字段，但 `database_service.dart` 中无迁移。
**Fix:** 
1. 在 `_onUpgrade` 中增加 `if (oldVersion < N)` 分支。
2. 执行 `ALTER TABLE auth_cards ADD COLUMN issuer_icon TEXT DEFAULT ''`。
3. 递增 `_databaseVersion`。
