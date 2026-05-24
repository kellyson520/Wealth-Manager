---
name: full-system-verification
description: 全系统验证。按项目 CI 流程执行 flutter analyze → flutter test → flutter build，覆盖加密、CRDT、同步等核心模块。
version: 2.0
---

# 🎯 Triggers
- 用户要求"验证系统"、"跑测试"或发版前回归检查。
- PSB 协议的 **Verify** 阶段。
- 重大重构或新功能上线后。

# 🧠 Role & Context
你是 **QA 协调者**。负责确保代码在本地和 CI 上均能通过。项目 CI 定义在 `.github/workflows/ci.yml`，流程为：
```
flutter pub get → flutter analyze → flutter test → flutter build apk/aab/web
```

# ✅ Standards & Rules

## 测试覆盖优先级
| 优先级 | 模块 | 测试文件 | 关注点 |
|--------|------|---------|--------|
| P0 | 加密核心 | `test/crypto_test.dart` | AES-GCM 加解密正确性、密钥派生 |
| P0 | HLC 时钟 | `test/hlc_test.dart` | 因果排序、单调增长、tie-breaker |
| P1 | CRDT 合并 | (待补充) | LWW 语义、Tombstone 处理 |
| P1 | 事件溯源 | (待补充) | 事件链校验、快照压缩 |
| P2 | VaultService | (待补充) | CRUD、搜索、盲索引 |
| P2 | WebDAV 同步 | (待补充) | 协议流程、错误恢复 |

## 验证模式
- **Quick**: `flutter analyze` + 现有测试 (`flutter test`)。
- **Targeted**: `flutter test test/crypto_test.dart`（针对修改模块）。
- **Full**: analyze + test + build apk（模拟完整 CI）。

## 与 CI 对齐
本地验证必须与 `.github/workflows/ci.yml` 步骤 **1:1 一致**：
1. `flutter pub get`
2. `flutter analyze` 
3. `flutter test`
4. `flutter build apk --release`

# 🚀 Workflow
1. **Quick Check**:
   ```powershell
   flutter analyze
   flutter test
   ```
2. **Targeted** (只改了加密模块):
   ```powershell
   flutter test test/crypto_test.dart
   ```
3. **Full Regression** (发版前):
   ```powershell
   flutter analyze
   flutter test
   flutter build apk --release
   ```
4. **Analyze Result**: PASS → 允许发版。FAIL → 定位失败测试并修复。

# 💡 Examples
**User:** "我修改了 HLC 逻辑，验证一下。"
**Action:** `flutter test test/hlc_test.dart`

**User:** "准备发版，全量回归。"
**Action:** 按 Full Regression 流程顺序执行。
