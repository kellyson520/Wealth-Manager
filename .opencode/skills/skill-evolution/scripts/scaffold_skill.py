import argparse
import os
import sys

TEMPLATE = """---
name: {name}
description: {desc}
version: 1.0
---

# 🎯 Triggers
- When [Specific Condition A].
- When [Specific Condition B].

# 🧠 Role & Context
You are a **[Role Name]**. You check for [Context]. you prioritize [Values].

# ✅ Standards & Rules
- **Rule 1**: ...
- **Rule 2**: ...

# 🚀 Workflow
1.  **Step 1**: ...
2.  **Step 2**: ...
    ```bash
    # python .agent/skills/{name}/scripts/script.py
    ```

# 💡 Examples

**User Input:**
"[Example Input]"

**Ideal Agent Response:**
"[Example Output]"
"""

def create_skill(name, desc, base_dir=".agent/skills"):
    target_dir = os.path.join(base_dir, name)
    
    if os.path.exists(target_dir):
        print(f"Error: Skill '{name}' already exists at {target_dir}")
        sys.exit(1)
        
    # Create Layout
    os.makedirs(os.path.join(target_dir, "scripts"), exist_ok=True)
    os.makedirs(os.path.join(target_dir, "examples"), exist_ok=True)
    
    # Create SKILL.md
    skill_md = os.path.join(target_dir, "SKILL.md")
    with open(skill_md, "w", encoding="utf-8") as f:
        f.write(TEMPLATE.format(name=name, desc=desc))
        
    print(f"✅ Skill scaffolded: {target_dir}")
    print(f"   - {skill_md}")
    print(f"   - {target_dir}/scripts/")
    print(f"👉 Next Step: Fill in {skill_md} with detailed instructions.")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Scaffold a new AI skill")
    parser.add_argument("--name", required=True, help="Skill name (kebab-case)")
    parser.add_argument("--desc", required=True, help="Short description")
    
    args = parser.parse_args()
    
    # Ensure we are in root or close to it
    if not os.path.exists(".agent"):
        # Try to find .agent in current or parent
        if os.path.exists("../.agent"):
            os.chdir("..")
            
    if not os.path.exists(".agent"):
         print("Error: Could not find .agent directory. Run from project root.")
         sys.exit(1)
         
    create_skill(args.name, args.desc)
