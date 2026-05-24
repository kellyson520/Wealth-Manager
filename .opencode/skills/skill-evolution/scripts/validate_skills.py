
import os
import yaml
import re

def validate_skills(base_dir=".agent/skills", agents_file="AGENTS.md"):
    print(f"🔍 Validating skills in {base_dir}...")
    
    if not os.path.exists(base_dir):
        print(f"❌ Base directory {base_dir} does not exist.")
        return

    skills = [d for d in os.listdir(base_dir) if os.path.isdir(os.path.join(base_dir, d))]
    
    # Check AGENTS.md registration
    registered_skills = set()
    if os.path.exists(agents_file):
        with open(agents_file, 'r', encoding='utf-8') as f:
            content = f.read()
            # Simple regex to find <name>...</name> inside <skill> blocks
            matches = re.findall(r'<skill>.*?<name>(.*?)</name>.*?</skill>', content, re.DOTALL)
            registered_skills = set(m.strip() for m in matches)
    else:
        print(f"⚠️  {agents_file} not found. Skipping registration check.")

    issues_found = False

    for skill in skills:
        skill_path = os.path.join(base_dir, skill)
        skill_md = os.path.join(skill_path, "SKILL.md")
        
        print(f"Checking {skill}...")
        
        # 1. Existence of SKILL.md
        if not os.path.exists(skill_md):
            print(f"  ❌ Missing SKILL.md in {skill}")
            issues_found = True
            continue # Cannot check metadata

        # 2. Metadata Check
        try:
            with open(skill_md, 'r', encoding='utf-8') as f:
                content = f.read()
                
            # Extract YAML frontmatter
            match = re.match(r'^---\s+(.*?)\s+---', content, re.DOTALL)
            if not match:
                print(f"  ❌ Missing or invalid YAML frontmatter in SKILL.md for {skill}")
                issues_found = True
            else:
                frontmatter = yaml.safe_load(match.group(1))
                if 'name' not in frontmatter:
                    print(f"  ❌ Missing 'name' in frontmatter for {skill}")
                    issues_found = True
                elif frontmatter['name'] != skill:
                     print(f"  ⚠️  Name mismatch: Folder '{skill}' vs Meta '{frontmatter['name']}'")
                     
                if 'description' not in frontmatter:
                    print(f"  ❌ Missing 'description' in frontmatter for {skill}")
                    issues_found = True
                    
        except Exception as e:
            print(f"  ❌ Error parsing SKILL.md for {skill}: {e}")
            issues_found = True

        # 3. Registration Check
        if registered_skills and skill not in registered_skills:
             print(f"  ⚠️  Skill '{skill}' is NOT registered in {agents_file}")
             # Not strictly an error for the folder structure, but a system consistency issue

    if not issues_found:
        print("\n✅ All skill folders appear compliant structure-wise.")
    else:
        print("\n❌ Issues found. Please fix them using 'skill-evolution'.")

if __name__ == "__main__":
    # Adjust paths if checking from different pwd
    root_dir = os.getcwd()
    if not os.path.exists(".agent"):
        if os.path.exists("../.agent"):
             os.chdir("..")
             root_dir = os.getcwd()
    
    validate_skills()
