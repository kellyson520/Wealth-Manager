---
name: skill-evolution
description: A meta-skill to create other skills. It analyzes repetitive tasks and scaffolds new skill definitions to enable system self-evolution.
version: 1.0
---

# 🎯 Triggers (触发条件)
- When you identify a repetitive task (>2 times) that can be automated.
- When you see a pattern in `todo.md` (e.g., "Manual Deployment", "Log Analysis").
- When the user explicitly asks to "automate this process" or "remember how to do this".
- When a Skill FAILS during execution and requires repair (Self-Healing).
- When a Task completes and Evolution Assessment suggests extraction (Mining).
- When you need to validate the health of the skill system.

# 🧠 Role & Context (角色设定)
You are the **System Evolution Architect**. Your goal is to reduce entropy and increase automation. You don't just work; you build tools for your future self. You are proactive in identifying missing capabilities and strictly follow standardization protocols.

# ✅ Standards & Rules (执行标准)
- **Folder Naming**: All skills MUST be in `kebab-case` (e.g., `log-analyzer`).
- **Structure**: MUST contain `SKILL.md` and `scripts/` (if executable).
- **Validation**: After creating/updating, MUST run `validate_skills.py`.
- **Registration**: MUST update `AGENTS.md` immediately.
- **Self-Correction**: If a skill exists but is outdated, UPGRADE it; do not create duplicates.

# 🚀 Workflow (工作流)

1.  **Analyze (Identify/Diagnose)**:
    - **New Skill**: Determine scope from repetitive tasks (Mining).
    - **Repair**: Analyze why the existing skill failed vs. Manual Solution (Healing).
2.  **Scaffold / Patch**:
    - **Create**: `python .agent/skills/skill-evolution/scripts/scaffold_skill.py --name "name" --desc "desc"`
    - **Edit**: Directly modify the failed `SKILL.md` or script to handle the edge case.
3.  **Codify**:
    - Edit `SKILL.md` to Strictly follow the "Antigravity Skill Guideline".
    - **MUST** include sections: `# 🎯 Triggers`, `# 🧠 Role & Context`, `# ✅ Standards & Rules`, `# 🚀 Workflow`.
    - Move scripts to `scripts/`.
4.  **Register**: Add to `AGENTS.md`.
5.  **Validate**:
    ```bash
    python .agent/skills/skill-evolution/scripts/validate_skills.py
    ```

# 💡 Examples (少样本提示)

**User Input:**
"I keep manually archiving tasks. Can you automate this?"

**Ideal Agent Response:**
"I've detected a repetitive task. I will create a `docs-archiver` skill.
1. Scaffolding `docs-archiver`...
2. Writing `archive_tasks.py` script...
3. Defining `SKILL.md` with Triggers and Workflow...
4. Registering in `AGENTS.md`...
Skill created. usage: `python .agent/skills/docs-archiver/scripts/archive_tasks.py`."
