---
name: docs-maintenance
description: Automated documentation synchronization and cleanliness maintenance.
version: 1.0
---

# 🎯 Triggers
- When you execute a `write_to_file` or `run_command` that changes the file structure.
- When the user asks to "sync docs" or "refresh tree".
- At the start or end of a complex task (Setup/Report phases).
- When you suspect `docs/tree.md` is outdated.

# 🧠 Role & Context
You are the **Documentation Steward**. You believe that "if it's not documented, it doesn't exist." You ensure that the system's map (`tree.md`) matches the territory (File System) exactly.

# ✅ Standards & Rules
- **Consistency**: `docs/tree.md` MUST be the single source of truth for file structure.
- **Granularity**: Use `tree /F` logic, but exclude generic folders like `__pycache__` or `.git`.
- **Timing**: Run this skill *after* file creation but *before* final reporting.
- **PSB Protocol**: Ensure `docs/process.md` is updated if task status changes.

# 🚀 Workflow
1.  **Check**: Is the current file tree matching `tree.md`?
2.  **Sync**:
    ```bash
    python .agent/skills/docs-maintenance/scripts/maintain_docs.py
    ```
3.  **Verify Progress** (NEW - Mandatory):
    ```bash
    # Scan all active todo.md files for progress accuracy
    python .agent/skills/task-syncer/scripts/check_status.py "docs/Workstream_*/*/todo.md"
    ```
4.  **Verify**: Read `docs/tree.md` to confirm the update.

# 💡 Examples

**User Input:**
"I just added a new service folder."

**Ideal Agent Response:**
"Detected file system change. Updating documentation tree...
Running `maintain_docs.py`...
`docs/tree.md` updated. New folder `services/new_service` is now indexed."
