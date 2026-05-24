---
name: task-lifecycle-manager
description: 标准化任务生命周期管理，涵盖任务创建(Template)、进度同步(Sync)、文档规范(Spec/Report)及闭环归档(Finalize)。确保 PSB 协议的文档完整性与状态真实性。
version: 2.0
---

# Task Lifecycle Manager (TLM)

此技能定义了 ZTD Password Manager 项目中任务管理的**唯一标准流程**。

## 1. 核心理念

> **文档即状态 (Documentation is State)**
> 代码是逻辑的载体，而文档是工程进度的唯一真理来源。
> 永远不要让 `todo.md` 的状态落后于代码实现。

## 2. 文档规范

所有任务文件夹 (`docs/Workstream_{Domain}/{Date}_{TaskName}`) 必须包含：

### 2.1 `todo.md`
- **Context**: 1-2 句话描述任务背景。
- **Strategy**: 核心技术路径。
- **Phased Checklist**: 按 Phase 分阶段 Checkbox。
- 状态: `[ ]` 待开始 / `[x]` 已完成 / `[~]` 挂起。

### 2.2 `spec.md`
- 触发条件: 涉及 DB 变更、API/模型变更、架构调整时。
- 内容: Schema 定义、类设计、数据流图。

### 2.3 `report.md`
- 任务结束时编写。
- 内容: 产出总结、架构变更、测试验证结果。

### 2.4 `process.md` (全局)
- 位于 `docs/process.md`。
- 任务启动时添加条目，完成时更新为 `100%`。

## 3. SOP

### Stage 1: Initialization
1. 确定 `Workstream_{Domain}`。
2. 创建 `docs/Workstream_{Domain}/{YYYYMMDD}_{TaskName}/`。
3. 生成 `todo.md`，注册到 `docs/process.md`。

### Stage 2: Synchronization
- 每次对话结束前或用户询问进度时执行。
- 对比代码实现与 `todo.md` 的 Checkbox 状态。
- 代码已实现但文档未勾选 → 立即勾选。

### Stage 3: Finalization
- 所有 P0/P1 Checkbox 为 `[x]` 时触发。
- 生成 `report.md`，更新 `process.md` 为 100%。
- 清理根目录临时文件。

### Stage 4: Evolution Assessment
- 报告提交后、归档前执行。
- 检查是否需要沉淀新技能 (`skill-evolution`)。

## 4. Actions

### `@check_status`
读取 `todo.md` → 对比代码 → 更新勾选状态。

### `@finalize_task`
确认全绿 → 生成 report → 更新 process → 提示闭环。

### `@create_spec`
在任务目录下创建 `spec.md` 模板。

## 5. 项目特定路径
- 代码: `lib/core/`, `lib/services/`, `lib/ui/`
- 测试: `test/`
- 文档: `docs/`
- 版本: `pubspec.yaml`
