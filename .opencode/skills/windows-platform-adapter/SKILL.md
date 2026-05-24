---
name: windows-platform-adapter
description: Windows/PowerShell 环境下的 Flutter 开发适配。处理 Gradle 路径、编码问题、SQLCipher NDK 编译及 PowerShell 命令差异。
version: 2.0
---

# 🎯 Triggers
- 在 Windows 上执行 `flutter build`、`flutter test` 或 `dart run build_runner` 时。
- 遇到文件编码异常（UTF-16 输出、中文乱码）。
- 路径相关错误（`\` vs `/`、长路径限制）。
- Gradle 在 Windows 上的特定行为差异。

# 🧠 Role & Context
你是 **Windows 平台适配专家**。本项目在 Windows 10+ 上使用 PowerShell 作为默认 Shell，Flutter SDK 3.24.5，Java 17。Windows 特有的问题集中在：编码、路径、Gradle daemon 和 NDK 工具链。

# ✅ Standards & Rules

## 1. PowerShell 命令对照
| 场景 | 命令 |
|------|------|
| 分析代码 | `flutter analyze` |
| 运行测试 | `flutter test test/crypto_test.dart` |
| 生成代码 | `dart run build_runner build --delete-conflicting-outputs` |
| 清理构建 | `flutter clean` |
| 搜索文件内容 | `Select-String -Pattern "xxx" -Path "lib/**/*.dart" -Recurse` |
| 删除目录 | `Remove-Item -Path "build" -Recurse -Force` |
| 设置环境变量 | `$env:JAVA_HOME="C:\Program Files\Java\jdk-17"` |

## 2. 编码处理
- `flutter analyze` 输出在 Windows 上可能包含 ANSI 转义码 → 用 `--no-color` 参数。
- Gradle 日志默认 GBK 编码 → 重定向时用 `| Out-File -Encoding utf8 build_log.txt`。
- Dart 文件必须保持 UTF-8 无 BOM。

## 3. 路径问题
- Windows 最大路径 260 字符 → Gradle 缓存 `~/.gradle` 可能超限。
  - 解决：`git config --system core.longpaths true`
- `pubspec.lock` 的路径分隔符在 Git 跨平台时可能冲突 → `.gitattributes` 中设置 `* text=auto`。

## 4. SQLCipher NDK 编译
- Windows 上编译 `sqflite_sqlcipher` 需要 Android NDK。
- 确保 `ANDROID_NDK_HOME` 环境变量已设置。
- CMake 构建错误时检查 NDK 版本与 `android/app/build.gradle` 中的 `ndkVersion` 是否一致。

## 5. Gradle Daemon
- Windows 上 Gradle daemon 可能占用文件锁 → `flutter clean` 前先 `./gradlew --stop`。
- 内存不足时设置 `android/gradle.properties`:
  ```
  org.gradle.jvmargs=-Xmx2048m
  org.gradle.daemon=true
  ```

# 🚀 Workflow
1. **Detect**: 确认是 Windows PowerShell 环境。
2. **Adapt**: 将 Unix 命令转为 PowerShell 等价物。
3. **Execute**: 执行命令。
4. **Recover**: 编码错误 → 加 `-Encoding utf8`；命令不存在 → 换 PowerShell cmdlet。

# 💡 Examples
**Scenario:** `flutter build apk` 报编码错误。
**Fix:** 
```powershell
$env:JAVA_TOOL_OPTIONS="-Dfile.encoding=UTF-8"
flutter build apk --release
```

**Scenario:** `build_runner` 报文件锁定。
**Fix:** 
```powershell
dart run build_runner clean
dart run build_runner build --delete-conflicting-outputs
```
