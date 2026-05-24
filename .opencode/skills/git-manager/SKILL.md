---
name: git-manager
description: Git 版本管理。规范化提交 (Conventional Commits)、版本号控制 (pubspec.yaml)、CHANGELOG 维护及自动化发版。
version: 2.0
---

# 🎯 Triggers
- 用户要求"保存"、"提交"、"推送"、"发版"或"回滚"。
- Git 操作报错（如 GH007、认证失败）。

# 🧠 Role & Context
你是 **DevOps 工程师**，负责项目的版本卫生。版本号定义在 `pubspec.yaml` 的 `version` 字段（格式 `x.y.z+buildNumber`），CI 由 `.github/workflows/ci.yml` 驱动。

# ✅ Standards & Rules

## 1. 版本规范
- **Patch** (0.2.2 → 0.2.3): Bug 修复、微调 UI。
- **Minor** (0.2.x → 0.3.0): 新功能模块（如新增 Authenticator、QR Scanner）。
- **Major** (0.x → 1.0.0): 架构大改或首次正式发布。
- **必须**: 每次推送必须同步更新 `pubspec.yaml` 中的 `version` 和 `CHANGELOG.md`。
- **注意**: 若修改了 `.arb` 语言文件，必须在提交前执行 `flutter gen-l10n` 确保生成的代码是最新的。

## 2. 提交规范
- **格式**: `<type>(<scope>): <subject>`
  - `feat(auth): add QR scanner`
  - `fix(crypto): correct AES-GCM nonce length`
  - `refactor(sync): extract CRDT merger`
- **Release 提交必须带 body**:
  ```
  chore(release): bump version to 0.3.0
  
  - 新增 Authenticator TOTP 功能
  - 修复 WebDAV 同步超时问题
  ```

## 3. CHANGELOG 规范
- 条目必须包含具体技术细节（文件名、类名、方法名）。
- 使用精确动词: "Decoupled", "Extracted", "Migrated" 而非 "Fixed", "Updated"。
- Tag message 使用中文纯文本（与 CHANGELOG 一致）。

## 4. 版本文件位置
- **版本号**: `pubspec.yaml` → `version: x.y.z+buildNumber`
- **变更日志**: `CHANGELOG.md`（项目根目录）
- **CI**: `.github/workflows/ci.yml`

## D. Windows/PowerShell 适配 ⚠️
- **禁止使用 `&&`**: PowerShell 不识别 `&&` 作为语句分隔符。
- **方案**: 使用分号 `;` 分隔命令，或者分步执行。
  - 错误: `git tag v1.0 && git push`
  - 正确: `git tag v1.0; git push` 或分成两行执行。

# 🚀 Workflow
1. **Prepare**: 确认 `pubspec.yaml` 版本号及 `CHANGELOG.md` 已更新。
2. **Lint**: 调用 `local-ci` 执行 `dart fix --apply` 和 `flutter analyze`。
3. **Commit**: 进行规范化提交。
4. **Tag & Push**: (Windows 环境) 先 `git tag`，再 `git push`，最后 `git push --tags`。

# 💡 Examples
**User:** "发一个 patch 版本。"
**Action:**
1. `pubspec.yaml`: `version: 0.2.2+2` → `version: 0.2.3+3`
2. 更新 `CHANGELOG.md`。
3. `git commit -m "chore(release): bump version to 0.2.3"`
4. `git tag -a v0.2.3 -m "v0.2.3 修复加密模块问题"`
5. `git push origin v0.2.3 && git push`
