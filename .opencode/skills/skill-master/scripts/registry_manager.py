
import os
import re
import yaml

AGENTS_FILE = "AGENTS.md"
SKILLS_DIR = ".agent/skills"

def get_skills():
    skills = []
    if not os.path.exists(SKILLS_DIR):
        print(f"Skills directory {SKILLS_DIR} not found.")
        return skills

    for item in os.listdir(SKILLS_DIR):
        skill_path = os.path.join(SKILLS_DIR, item)
        md_path = os.path.join(skill_path, "SKILL.md")
        
        if os.path.isdir(skill_path) and os.path.exists(md_path):
            try:
                with open(md_path, 'r', encoding='utf-8') as f:
                    content = f.read()
                    
                # Extract frontmatter
                match = re.match(r'^---\s+(.*?)\s+---', content, re.DOTALL)
                if match:
                    frontmatter = yaml.safe_load(match.group(1))
                    name = frontmatter.get('name', item)
                    # Clean description: remove newlines, extra spaces
                    desc = frontmatter.get('description', 'No description provided.')
                    if isinstance(desc, str):
                        desc = " ".join(desc.split())
                    
                    skills.append({
                        'name': name,
                        'description': desc,
                        'location': 'project',
                        'path': f".agent/skills/{name}/SKILL.md"
                    })
            except Exception as e:
                print(f"Error parsing {md_path}: {e}")
    
    # Sort by name
    skills.sort(key=lambda x: x['name'])
    return skills

def update_agents_md(skills):
    if not os.path.exists(AGENTS_FILE):
        print(f"{AGENTS_FILE} not found!")
        return

    with open(AGENTS_FILE, 'r', encoding='utf-8') as f:
        content = f.read()

    # Generate XML with correct indentation and usage instructions
    # Compliance Fix: Usage must refer to view_file, not bash/openskills
    xml_block = [
        "\n<!-- SKILLS_TABLE_START -->\n",
        "<usage>\n",
        "Check if any skill matches the user's request.\n",
        "Action: view_file(AbsolutePath=\".../SKILL.md\")\n",
        "</usage>\n\n",
        "<available_skills>\n"
    ]
    
    for skill in skills:
        entry = f"""
  <skill>
    <name>{skill['name']}</name>
    <description>{skill['description']}</description>
    <path>{skill['path']}</path>
    <location>{skill['location']}</location>
  </skill>
"""
        xml_block.append(entry)
    
    xml_block.append("\n</available_skills>\n")
    xml_block.append("<!-- SKILLS_TABLE_END -->\n")
    
    new_content_block = "".join(xml_block)

    # Regex replace between markers, preserving the markers is tricky if we include them in the block.
    # The previous script replaced content BETWEEN markers. 
    # Let's stick to replacing content BETWEEN markers to avoid duplicating markers if they exist.
    
    # Re-structure to NOT include markers in the block, so we match the existing markers
    
    inner_block = [
        "\n<usage>\n",
        "Check if any skill matches the user's request.\n",
        "Action: view_file(AbsolutePath=\".../SKILL.md\") before proceeding.\n",
        "</usage>\n\n",
        "<available_skills>\n"
    ]
    
    for skill in skills:
        entry = f"""
  <skill>
    <name>{skill['name']}</name>
    <description>{skill['description']}</description>
    <path>{skill['path']}</path>
    <location>{skill['location']}</location>
  </skill>
"""
        inner_block.append(entry)
    
    inner_block.append("\n</available_skills>\n")
    
    new_inner_content = "".join(inner_block)

    pattern = r'(<!-- SKILLS_TABLE_START -->)(.*?)(<!-- SKILLS_TABLE_END -->)'
    replacement = f"\\1{new_inner_content}\\3"
    
    new_full_content, count = re.subn(pattern, replacement, content, flags=re.DOTALL)
    
    if count == 0:
        print("Markers not found. Appending to end...")
        # Fallback if markers missing
        with open(AGENTS_FILE, 'a', encoding='utf-8') as f:
            f.write("\n\n<!-- SKILLS_TABLE_START -->")
            f.write(new_inner_content)
            f.write("<!-- SKILLS_TABLE_END -->\n")
    else:
        with open(AGENTS_FILE, 'w', encoding='utf-8') as f:
            f.write(new_full_content)
        print(f"Updated {AGENTS_FILE} with {len(skills)} skills.")

if __name__ == "__main__":
    skills = get_skills()
    update_agents_md(skills)
