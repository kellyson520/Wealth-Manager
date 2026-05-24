import os

def generate_tree_markdown(root_dir):
    """
    Generates a markdown tree structure of the given directory,
    mimicking the format of the existing tree.md.
    """
    output_lines = []
    
    # Header
    output_lines.append(f"# TG ONE Project Structure")
    output_lines.append(f"")
    from datetime import datetime
    output_lines.append(f"> Updated: {datetime.now().strftime('%Y-%m-%d %H:%M')}")
    output_lines.append(f"")
    output_lines.append(f"---")
    output_lines.append(f"")
    output_lines.append(f"## Directory Overview")
    output_lines.append(f"")
    output_lines.append(f"```")
    output_lines.append(f"TG ONE/")
    
    # Overview (Level 1 only)
    ignore_dirs = {'.git', '__pycache__', '.idea', 'node_modules', '.mypy_cache', '.pytest_cache', '.venv', 'dist', 'build', 'coverage', '.agent', '.claude'}
    
    items = sorted(os.listdir(root_dir))
    
    # Priority folders to show first if they exist (optional, relying on alpha sort usually)
    
    for item in items:
        full_path = os.path.join(root_dir, item)
        if item in ignore_dirs:
            continue
            
        if os.path.isdir(full_path):
            comment = get_dir_comment(item)
            output_lines.append(f"├── 📁 {item:<20} # {comment}")
        elif os.path.isfile(full_path):
             comment = get_file_comment(item)
             output_lines.append(f"├── 📄 {item:<20} # {comment}")
             
    output_lines.append(f"```")
    output_lines.append(f"")
    output_lines.append(f"---")
    output_lines.append(f"")
    output_lines.append(f"## Detailed Structure")
    
    # Detailed recursive walkthrough for important dirs
    important_dirs = ['ai', 'core', 'docs', 'handlers', 'services', 'ui', 'utils', 'web_admin', 'modern_web_ui']
    
    for folder in important_dirs:
        folder_path = os.path.join(root_dir, folder)
        if os.path.isdir(folder_path):
             output_lines.append(f"")
             output_lines.append(f"### 📁 `{folder}/`")
             output_lines.append(f"")
             output_lines.append(f"```")
             
             # Walk the folder (limit depth to avoiding huge files)
             tree_str = walk_dir(folder_path, prefix="", root_name=folder)
             output_lines.append(tree_str.strip())
             output_lines.append(f"```")
            
    return "\n".join(output_lines)

def get_dir_comment(name):
    comments = {
        'ai': 'AI Provider Integration',
        'archive': 'Data Archival',
        'config': 'Global Config',
        'core': 'Core Business Logic',
        'docs': 'Documentation (PSB)',
        'enums': 'Enumerations',
        'filters': 'Message Filters',
        'handlers': 'Command & Event Handlers',
        'listeners': 'Event Listeners',
        'managers': 'State Managers',
        'middlewares': 'Middleware Layer',
        'models': 'Data Models',
        'modern_web_ui': 'Vue3 Web UI',
        'repositories': 'Data Access Layer',
        'rss': 'RSS Services',
        'scheduler': 'Task Scheduler',
        'scripts': 'Utility Scripts',
        'services': 'Service Layer',
        'tests': 'Test Suite',
        'ufb': 'UFB Client',
        'ui': 'Bot UI Renderer',
        'utils': 'Utilities',
        'web_admin': 'FastAPI Admin Backend',
    }
    return comments.get(name, 'Directory')

def get_file_comment(name):
    comments = {
        'main.py': 'Application Entry',
        'version.py': 'Version Info',
        'requirements.txt': 'Python Dependencies',
        'AGENTS.md': 'AI Skills Context',
        'Dockerfile': 'Docker Build',
    }
    return comments.get(name, 'File')

def walk_dir(path, prefix="", root_name=""):
    out = []
    # Similar to 'tree' command
    items = sorted([i for i in os.listdir(path) if i not in {'__pycache__', 'node_modules', '.git'}])
    # Filter hidden files
    items = [i for i in items if not i.startswith('.')]
    
    count = len(items)
    for i, item in enumerate(items):
        is_last = (i == count - 1)
        connector = "└── " if is_last else "├── "
        child_prefix = "    " if is_last else "│   "
        
        full_path = os.path.join(path, item)
        
        out.append(f"{prefix}{connector}{item}")
        
        if os.path.isdir(full_path):
            # Recurse
            # Don't go too deep to protect context window
            # Stop at certain depth if needed, or specific huge folders
            sub_prefix = prefix + child_prefix
            
            # Simple depth guard isn't here, assuming reasonable structure
            sub_out = walk_dir(full_path, sub_prefix)
            if sub_out:
                out.append(sub_out)
                
    return "\n".join(out)

if __name__ == "__main__":
    # Ideally root is the project root.
    # Determine project root based on script location
    script_dir = os.path.dirname(os.path.abspath(__file__))
    project_root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(script_dir))))
         
    md_content = generate_tree_markdown(project_root)
    
    docs_path = os.path.join(project_root, 'docs', 'tree.md')
    with open(docs_path, 'w', encoding='utf-8') as f:
        f.write(md_content)
        
    print(f"Successfully updated {docs_path}")
