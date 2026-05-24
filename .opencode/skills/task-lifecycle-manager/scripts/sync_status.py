import os
import re
from pathlib import Path

PROCESS_FILE = Path("docs/process.md")
DOCS_DIR = Path("docs")

def get_checkbox_stats(file_path):
    total = 0
    done = 0
    content = ""
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            content = f.read()
    except UnicodeDecodeError:
        try:
            with open(file_path, 'r', encoding='gb18030') as f:
                content = f.read()
        except:
            return 0, 0 # Skip file if unreadable

    # Find all checkboxes: - [ ] or - [x]
    matches = re.findall(r'-\s*\[([ xX])\]', content)
    total = len(matches)
    done = sum(1 for m in matches if m.lower() == 'x')
    return total, done

def scan_tasks():
    print(f"{'Task Name':<50} | {'Todo Progress':<15} | {'Path':<20}")
    print("-" * 100)
    
    tasks_data = []

    # Iterate Workstreams
    for root, dirs, files in os.walk(DOCS_DIR):
        if "todo.md" in files:
            path = Path(root)
            # Filter for task folders (YYYYMMDD_...)
            if not re.match(r'\d{8}_', path.name):
                continue
            
            todo_path = path / "todo.md"
            total, done = get_checkbox_stats(todo_path)
            
            if total == 0:
                percent = 0
            else:
                percent = int((done / total) * 100)
                
            tasks_data.append({
                "name": path.name,
                "percent": percent,
                "done": done,
                "total": total,
                "path": str(path).replace("\\", "/")
            })
            
            print(f"{path.name:<50} | {percent}% ({done}/{total}) | {path}")

    return tasks_data

def check_process_alignment(tasks_data):
    # This is a basic check to see if the task is in process.md
    # Improving this requires parsing the table in process.md, which can be complex.
    # For now, just listing the current status is a big help.
    if not PROCESS_FILE.exists():
        print("process.md not found!")
        return

    with open(PROCESS_FILE, 'r', encoding='utf-8') as f:
        process_content = f.read()

    print("\n[Alignment Check]")
    print("Checking if tasks serve in process.md...")
    
    for task in tasks_data:
        # Simple string match for the task folder name or key part in process.md
        # Process md usually has links like [Folder](./Workstream.../Folder)
        if task['name'] in process_content:
            status = "Registered"
            # Check if 100% is updated
            if task['percent'] == 100 and "100%" not in process_content.split(task['name'])[1].split("\n")[0]:
                 status = "⚠️ Mismatch (Repo=100%, Process!=100%)"
        else:
            status = "❌ Missing in process.md"
            
        print(f"{task['name']:<50} : {status}")

if __name__ == "__main__":
    print("Scanning Task Statuses...")
    data = scan_tasks()
    check_process_alignment(data)
