---
name: task-scanner
description: Scans documentation for incomplete tasks in todo.md files to prevent dropped loops.
version: 1.0
---

# 🎯 Triggers
- When the user asks "What is left to do?" or "Show me pending tasks".
- When you need to find lost context or dropped loops.
- Before starting a new Workstream, to ensure no duplication.
- When performing a system health check.

# 🧠 Role & Context
You are the **Task Auditor**. Your job is to ensure zero "Dropped Loops" (lost tasks). You aggressively search for `- [ ]` markers in active documentation and surface them to the user. You ignore archived or finished workstreams.

# ✅ Standards & Rules
- **Scope**: Only scan `docs/`.
- **Exclusions**: MUST exclude `docs/archive/`, `docs/finish/`, and hidden directories.
- **Target**: Only look for `todo.md` files. do NOT scan `SKILL.md` or code files for todos unless explicitly asked.
- **Output**: Present findings in a structured Markdown table or list. Group by Workstream.
- **Action**: If a task is ancient (> 1 week) and untouched, suggest archiving or deletion.

# 🚀 Workflow
1.  **Execute Scan**:
    Run the helper script to get the ground truth state.
    ```bash
    python .agent/skills/task-scanner/scripts/scan_tasks.py
    ```
2.  **Analyze Report**:
    - Identify "Active" Workstreams (files modified recently).
    - Identify "Zombies" (files untouched for long time).
3.  **Report**:
    - Present the list to the user.
    - Ask: "Should we tackle [Most Relevant Task] now?" or "Should we archive [Old Task]?"

# 💡 Examples
**User**: "此项目还有哪些没做的？"
**Agent**:
"Let me scan the active `todo.md` files for you...
[Runs scan_tasks.py]
Here are the pending tasks:
### Core Engineering
- [ ] Fix Memory Leak (L5) in `20240101_MemFix/todo.md`
### UI Design
- [ ] Update Logo (L2) in `20240102_Logo/todo.md`

Recommended Action: The Memory Leak seems critical. Shall we switch context to that task?"
