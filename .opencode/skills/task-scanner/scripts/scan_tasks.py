import os
import json
import argparse
from typing import List, Dict

DOCS_ROOT = "docs"
EXCLUDE_DIRS = {"archive", "finish", ".git", ".agent"}

def is_ignored(path: str) -> bool:
    parts = path.split(os.sep)
    for part in parts:
        if part in EXCLUDE_DIRS:
            return True
    return False

def scan_todos(root_dir: str) -> List[Dict]:
    results = []
    
    # Walk through the directory
    for root, dirs, files in os.walk(root_dir):
        # Filter out excluded directories in-place
        dirs[:] = [d for d in dirs if d not in EXCLUDE_DIRS]
        
        if "todo.md" in files:
            file_path = os.path.join(root, "todo.md")
            if is_ignored(file_path):
                continue
                
            try:
                with open(file_path, 'r', encoding='utf-8') as f:
                    lines = f.readlines()
                    
                tasks = []
                for idx, line in enumerate(lines):
                    line = line.strip()
                    if line.startswith("- [ ]") or line.startswith("* [ ]"):
                        task_text = line.replace("- [ ]", "").replace("* [ ]", "").strip()
                        # Extract Task ID if exists (<!-- id: 1 -->)
                        # Minimal extraction, just get text
                        tasks.append({
                            "line": idx + 1,
                            "text": task_text
                        })
                
                if tasks:
                    rel_path = os.path.relpath(file_path, os.getcwd())
                    results.append({
                        "file": rel_path,
                        "tasks": tasks,
                        "count": len(tasks)
                    })
                    
            except Exception as e:
                print(f"Error reading {file_path}: {e}")

    return results

def print_markdown(results: List[Dict]):
    print(f"# 🚨 Incomplete Task Scan Report\n")
    print(f"**Scan Target**: `{DOCS_ROOT}` (excluding {EXCLUDE_DIRS})\n")
    
    total_files = len(results)
    total_tasks = sum(r['count'] for r in results)
    
    print(f"**Summary**: Found {total_tasks} incomplete tasks across {total_files} files.\n")
    
    for item in results:
        print(f"### 📄 `{item['file']}` ({item['count']})")
        for task in item['tasks']:
            print(f"- [ ] {task['text']} (L{task['line']})")
        print("")

def main():
    parser = argparse.ArgumentParser(description="Scan for incomplete tasks in todo.md files.")
    parser.add_argument("--json", action="store_true", help="Output in JSON format")
    args = parser.parse_args()
    
    cwd = os.getcwd()
    target_dir = os.path.join(cwd, DOCS_ROOT)
    
    if not os.path.exists(target_dir):
        print(f"Error: {DOCS_ROOT} directory not found.")
        return

    results = scan_todos(target_dir)
    
    # Sort by file path
    results.sort(key=lambda x: x['file'])

    if args.json:
        print(json.dumps(results, indent=2, ensure_ascii=False))
    else:
        print_markdown(results)

if __name__ == "__main__":
    main()
