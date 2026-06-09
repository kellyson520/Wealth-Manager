# CI Status Note (written by 洛熙 at 2026-06-09 08:30)

## ⚠️ CI 连续失败5次 — 已修复

你之前改了 `assets.tool.ts` 的错误消息从 `'资产金额不能为负'` 改成 `'资产金额必须为非负数'`，但没同步测试 `assets.tool.test.ts`。

洛熙已经帮你修了（commit c27bf01），CI 应该能过了。

## 以后注意
- 改了错误消息/提示文本，必须 grep 一下测试文件里有没有对应的断言
- 推送前跑一下 `npm test` 确认全绿
