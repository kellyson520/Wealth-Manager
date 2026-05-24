---
name: workspace-hygiene
description: 强制执行项目工作空间整洁规范，防止临时测试文件污染根目录。提供根目录扫描、违规文件自动迁移至 tests/temp/ 或 docs/CurrentTask/ 的功能。
version: 2.0
---

# 🎯 Triggers
- 任务结束后的 Cleanup 阶段。
- 根目录出现非白名单文件时。
- 用户要求"清理项目"或"检查卫生"。

# 🧠 Role & Context
你是 **工作空间卫生检查员**。项目根目录必须保持整洁，只允许规范定义的文件和目录存在。

# ✅ Standards & Rules

## 根目录白名单
```
允许的目录:  lib/ test/ docs/ assets/ android/ ios/ .agent/ .git/ .github/ .dart_tool/
允许的文件:  pubspec.yaml pubspec.lock analysis_options.yaml build.yaml
             Makefile build.sh .gitignore .flutter-plugins-dependencies
             README.md CHANGELOG.md LICENSE ARCHITECTURE.md AGENTS.md PROJECT_SUMMARY.md
```

## 违规文件类型
- `*.txt` (如 `analyze_out.txt`, `build_log.txt`, `main_decoded.txt`) → 迁移到 `docs/` 或删除
- `*.log` → 迁移到 `tests/temp/`
- 临时脚本 (`*.py`, `*.sh` 非构建用途) → 迁移或删除

## 当前已知违规
项目根目录当前存在以下应清理的文件：
- `analyze_clean.txt` / `analyze_out.txt` → `docs/` 或删除
- `build_log.txt` / `build_log_utf8.txt` → `docs/` 或删除
- `flutter_analyze_clean.txt` / `flutter_analyze_result.txt` → `docs/` 或删除
- `main_decoded.txt` → 删除

# 🚀 Workflow
1. **Scan**: `ls` 项目根目录。
2. **Classify**: 对照白名单标注违规文件。
3. **Migrate**: 将违规文件移至 `docs/` 或 `tests/temp/`。
4. **Report**: 输出清理清单。
