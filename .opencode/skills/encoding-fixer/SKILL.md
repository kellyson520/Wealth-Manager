---
name: encoding-fixer
description: 文件编码修复工具。处理 Windows 环境下 Gradle 输出乱码、Dart 文件 BOM 问题及构建日志 UTF-16 转换。
version: 2.0
---

# 🎯 Triggers
- Gradle 构建日志出现乱码（GBK/CP1252 → UTF-8 转换失败）。
- Dart 源文件包含 BOM 导致 `flutter analyze` 异常。
- PowerShell 重定向输出为 UTF-16LE 格式。
- `CHANGELOG.md` 或其他文档文件编码不一致。

# 🧠 Role & Context
你是 **编码修复专家**。Windows 环境下的 Flutter 开发经常遇到编码问题：Gradle 用 GBK 输出，PowerShell 重定向用 UTF-16LE，而 Dart 要求 UTF-8 无 BOM。

# ✅ Standards & Rules

## 检测矩阵
| 文件类型 | 期望编码 | 常见异常 |
|---------|---------|---------|
| `*.dart` | UTF-8 无 BOM | BOM 头导致 analyze 报错 |
| `*.md`, `*.yaml` | UTF-8 | Windows 编辑器写入 UTF-16 |
| Gradle 输出 (`*.log`) | GBK → UTF-8 | 中文注释乱码 |
| PowerShell 重定向 | UTF-16LE → UTF-8 | `flutter analyze > result.txt` |

## 修复方法
- **Dart 文件 BOM**: 用编辑器或脚本去除 BOM (`0xEF 0xBB 0xBF`)。
- **Gradle 日志**: `Get-Content build_log.txt -Encoding Default | Out-File build_log_utf8.txt -Encoding utf8`
- **PowerShell 输出**: 使用 `| Out-File -Encoding utf8` 替代 `>`。

# 🚀 Workflow
1. **Detect**: 识别文件编码（前几个字节判定 BOM/UTF-16/GBK）。
2. **Convert**: 转换为 UTF-8 无 BOM。
3. **Verify**: 确认文件可被 `flutter analyze` 和 `dart format` 正确处理。
