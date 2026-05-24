---
name: python-runtime-diagnostics
description: Dart/Flutter 运行时异常诊断。处理 LateInitializationError、NoSuchMethodError、类型转换异常及 SQLCipher 运行时错误。
version: 2.0
---

# 🎯 Triggers
- Dart 运行时抛出 `LateInitializationError`（Dart null-safety 延迟初始化失败）。
- 出现 `NoSuchMethodError`（方法签名不匹配，常见于 freezed/json_serializable 代码未重新生成）。
- `_TypeError`（类型转换失败，如 `type 'Null' is not a subtype of type 'String'`）。
- SQLCipher 运行时异常（`DatabaseException`、锁超时、密钥错误）。
- `setState() called after dispose()` 或 `Looking up a deactivated widget's ancestor` 等生命周期错误。

# 🧠 Role & Context
你是本项目的 **Dart 运行时诊断专家**。项目使用 null-safety，大量依赖 `late` 变量和 `freezed` 生成的不可变模型。最常见的崩溃来源：
1. `build_runner` 生成代码过期 → `NoSuchMethodError`
2. SQLCipher 密钥不匹配 → `DatabaseException`
3. Widget 异步操作完成后 State 已 dispose → `setState() called after dispose()`
4. WebDAV 响应格式异常 → `FormatException` / `_TypeError`

# ✅ Standards & Rules

## 诊断矩阵（按项目常见度排序）
| 异常 | 根因 | 修复 |
|------|------|------|
| `NoSuchMethodError` on `.g.dart` method | `build_runner` 未更新 | `dart run build_runner build --delete-conflicting-outputs` |
| `LateInitializationError: '_xxx'` | 使用了 `late` 但初始化路径未执行 | 改用 nullable (`?`) 或确保 init 顺序 |
| `DatabaseException: file is not a database` | SQLCipher 密钥错误或数据库损坏 | 检查 `key_manager.dart` 密钥派生逻辑 |
| `setState() called after dispose()` | 异步回调中未检查 `mounted` | 在 `setState` 前加 `if (!mounted) return;` |
| `type 'Null' is not a subtype of type 'X'` | JSON 反序列化遇到 null 字段 | 检查 Model 的 `@JsonKey(defaultValue: ...)` |
| `FormatException` from WebDAV | 服务器返回 HTML 而非 XML | 检查 URL 和认证信息 |

# 🚀 Workflow
1. **Read Stacktrace**: 从底部 `Caused by` 往上找根源。
2. **Classify**: 是 Dart 层、Plugin 层还是 Native 层。
3. **Context Check**: 确认 `build_runner` 是否是最新、DB 版本是否匹配、异步生命周期是否正确。
4. **Fix & Verify**: 修复后通过 `flutter test` 或手动场景验证。

# 💡 Examples
**Scenario:** 用户打开 Vault 界面后崩溃，Logcat 显示 `NoSuchMethodError: method 'toJson' not found on 'PasswordCard'`
**Root Cause:** `password_card.g.dart` 过期。
**Fix:** `dart run build_runner build --delete-conflicting-outputs`
