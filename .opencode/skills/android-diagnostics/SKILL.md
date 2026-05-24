---
name: android-diagnostics
description: Flutter 构建与原生层错误诊断。处理 Gradle 同步失败、build_runner 代码生成异常、SQLCipher 链接错误及平台特定崩溃。
version: 2.0
---

# 🎯 Triggers
- `flutter build` 或 `flutter run` 报错时。
- `dart run build_runner build` 生成代码报错（freezed/json_serializable 冲突）。
- Android 原生层崩溃（Logcat 中出现 `FATAL EXCEPTION`）。
- SQLCipher native library 加载失败 (`UnsatisfiedLinkError`, `DllNotFoundException`)。
- iOS `pod install` 失败或 CocoaPods 版本冲突。

# 🧠 Role & Context
你是本项目的 **构建诊断专家**。项目是 Flutter 密码管理器 (ZTD Password Manager)，依赖 `sqflite_sqlcipher`（本地加密DB）、`flutter_secure_storage`（TEE）、`mobile_scanner`（QR扫描）等原生插件。你需要快速定位构建错误是来自 Dart 层、Gradle/Xcode 层还是 native library 层。

# ✅ Standards & Rules

## 项目特定依赖链
```
pubspec.yaml
├── sqflite_sqlcipher → 需要 NDK (Android) / libsqlcipher (iOS)
├── flutter_secure_storage → Android Keystore / iOS Keychain
├── local_auth → BiometricPrompt (Android) / LAContext (iOS)
├── mobile_scanner → CameraX (Android) / AVFoundation (iOS)
├── webdav_client → dio → HTTP/TLS stack
└── freezed + json_serializable → build_runner 代码生成
```

## 诊断矩阵
| 错误类型 | 检查路径 | 修复方向 |
|---------|---------|---------|
| `build_runner` 冲突 | `*.g.dart` / `*.freezed.dart` 文件 | `dart run build_runner build --delete-conflicting-outputs` |
| Gradle sync 失败 | `android/build.gradle`, `android/app/build.gradle` | 检查 minSdkVersion、NDK 版本、依赖冲突 |
| SQLCipher 链接错误 | native library path | 检查 NDK 配置或 `sqflite_sqlcipher` 版本 |
| iOS Pod 失败 | `ios/Podfile`, `ios/Podfile.lock` | `cd ios && pod install --repo-update` |
| `flutter analyze` 报错 | `analysis_options.yaml` | 逐条修复 lint warning/error |

## 项目实际路径
- 入口: `lib/main.dart` → `AppNavigator` (StatefulWidget 状态机)
- 模型: `lib/core/models/` (password_card, auth_card, hlc, password_event)
- 加密: `lib/core/crypto/` (crypto_service, key_manager, crypto_facade, totp_generator)
- 存储: `lib/core/storage/database_service.dart` (SQLCipher)
- 同步: `lib/core/sync/webdav_sync.dart`
- 服务: `lib/services/vault_service.dart`, `lib/services/auth_service.dart`
- UI: `lib/ui/screens/` (11 screens)
- 测试: `test/crypto_test.dart`, `test/hlc_test.dart`

# 🚀 Workflow
1. **Extract**: 获取完整 error output（`flutter build apk --release 2>&1`）。
2. **Classify**: 判断错误层级 → Dart compile / build_runner / Gradle / Native。
3. **Fix**: 对症下药。
4. **Verify**: `flutter analyze` + `flutter build apk --release` 通过。

# 💡 Examples
**Scenario:** `build_runner` 报 `Conflicting outputs` 错误。
**Fix:** 
```bash
dart run build_runner build --delete-conflicting-outputs
```

**Scenario:** SQLCipher 在 Android 14 上崩溃。
**Fix:** 检查 `android/app/build.gradle` 的 `minSdkVersion` 及 NDK ABI filter。
