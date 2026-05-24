import shutil
import re
import sys
from pathlib import Path

# Base paths
BASE_DIR = Path(".").resolve()
DOCS_ROOT = BASE_DIR / "docs"
ARCHIVE_ROOT = DOCS_ROOT / "archive"

def setup_logger():
    # Simple logger to stdout
    return lambda msg: print(f"[DocsArchiver] {msg}")

log = setup_logger()

def is_task_completed(task_path):
    """
    Determines if a task folder is ready for archiving.
    Criteria:
    1. Must have a 'report.md' file (Phase 5 completion).
    2. If 'todo.md' exists, all items must be checked.
    """
    
    # Check 1: report.md must exist
    report_file = task_path / "report.md"
    if not report_file.exists():
        # log(f"Skipping {task_path.name}: No report.md")
        return False
    
    # Check 2: todo.md status
    todo_file = task_path / "todo.md"
    if todo_file.exists():
        try:
            content = ""
            try:
                with open(todo_file, "r", encoding="utf-8") as f:
                    content = f.read()
            except UnicodeDecodeError:
                # Fallback to utf-16 for files created by PowerShell/Windows
                with open(todo_file, "r", encoding="utf-16") as f:
                    content = f.read()

            # Simple check for unchecked items
            # Matches "- [ ]" or "* [ ]"
            if re.search(r"^\s*[-*]\s*\[\s\]", content, re.MULTILINE):
                # log(f"Skipping {task_path.name}: Unfinished todo items")
                return False
        except Exception as e:
            log(f"Error reading {todo_file}: {e}")
            return False
            
    return True

def archive_task(task_path, workstream_name):
    """Moves the task folder to the archive."""
    dest_parent = ARCHIVE_ROOT / workstream_name
    dest_path = dest_parent / task_path.name
    
    if dest_path.exists():
        log(f"Warning: Archive path already exists: {dest_path}. Skipping.")
        return

    try:
        dest_parent.mkdir(parents=True, exist_ok=True)
        shutil.move(str(task_path), str(dest_path))
        log(f"Archived: {task_path.name} -> {dest_path}")
    except Exception as e:
        log(f"Failed to move {task_path.name}: {e}")

def main():
    if not DOCS_ROOT.exists():
        log("Error: 'docs' directory not found in current path.")
        sys.exit(1)
        
    log("Starting archiving process...")
    
    # Find Workstream directories
    workstreams = [
        d for d in DOCS_ROOT.iterdir() 
        if d.is_dir() and d.name.startswith("Workstream_")
    ]
    
    count = 0
    for ws in workstreams:
        # Find task directories: pattern YYYYMMDD_...
        # We only look at direct children of Workstream folders
        tasks = [
            d for d in ws.iterdir() 
            if d.is_dir() and re.match(r"^\d{8}_", d.name)
        ]
        
        for task in tasks:
            if is_task_completed(task):
                archive_task(task, ws.name)
                count += 1
                
    if count == 0:
        log("No completed tasks found to archive.")
    else:
        log(f"Successfully archived {count} tasks.")
        log("Reminder: Please run the 'docs-maintenance' skill to update docs/tree.md")

if __name__ == "__main__":
    main()
