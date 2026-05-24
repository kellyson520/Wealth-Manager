import shutil
import re
from pathlib import Path

# Base paths
BASE_DIR = Path(".").resolve()
DOCS_ROOT = BASE_DIR / "docs"
ARCHIVE_ROOT = DOCS_ROOT / "archive"
FINISH_ROOT = DOCS_ROOT / "finish"

def log(msg):
    print(f"[BulkArchiver] {msg}")

def move_task(task_path, workstream_name):
    dest_parent = ARCHIVE_ROOT / workstream_name
    dest_path = dest_parent / task_path.name
    
    if dest_path.exists():
        log(f"Warning: Destination exists: {dest_path}. Skipping.")
        return False

    try:
        dest_parent.mkdir(parents=True, exist_ok=True)
        shutil.move(str(task_path), str(dest_path))
        log(f"Moved: {task_path.name} -> {dest_path}")
        return True
    except Exception as e:
        log(f"Error moving {task_path.name}: {e}")
        return False

def update_process_md():
    process_file = DOCS_ROOT / "process.md"
    if not process_file.exists():
        return
    
    log("Updating links in process.md...")
    content = ""
    try:
        with open(process_file, "r", encoding="utf-8") as f:
            content = f.read()
    except:
        with open(process_file, "r", encoding="utf-16") as f:
            content = f.read()
            
    # Replace ./finish/ with ./archive/
    new_content = content.replace("./finish/", "./archive/")
    
    # We don't need to replace ./Workstream_X/ because they are relative and if we move them, 
    # the link in process.md should ideally be updated from ./Workstream_X/Task to ./archive/Workstream_X/Task
    # Let's find all task links in Workstream_ folders
    
    workstreams = [d.name for d in DOCS_ROOT.iterdir() if d.is_dir() and d.name.startswith("Workstream_")]
    for ws in workstreams:
        # Match ./Workstream_Name/YYYYMMDD_
        pattern = rf"\./{ws}/(\d{{8}}_[^/ \)]+)"
        replacement = rf"./archive/{ws}/\1"
        new_content = re.sub(pattern, replacement, new_content)

    with open(process_file, "w", encoding="utf-8") as f:
        f.write(new_content)
    log("process.md updated.")

def main():
    if not DOCS_ROOT.exists():
        log("Docs root not found.")
        return

    # 1. Archive from finish/
    if FINISH_ROOT.exists():
        log("Checking finish/ folder...")
        for ws_dir in FINISH_ROOT.iterdir():
            if ws_dir.is_dir() and ws_dir.name.startswith("Workstream_"):
                for task_dir in ws_dir.iterdir():
                    if task_dir.is_dir():
                        move_task(task_dir, ws_dir.name)
        
        # Also check if there are orphan files in finish/Workstream_X
        # Such as report.md, spec.md, todo.md that were accidentally left there
        for ws_dir in FINISH_ROOT.iterdir():
            if ws_dir.is_dir() and ws_dir.name.startswith("Workstream_"):
                remaining = list(ws_dir.iterdir())
                if remaining:
                    log(f"Cleaning up files in {ws_dir}...")
                    dest_parent = ARCHIVE_ROOT / ws_dir.name
                    dest_parent.mkdir(parents=True, exist_ok=True)
                    for f in remaining:
                        dest_f = dest_parent / f.name
                        if not dest_f.exists():
                             shutil.move(str(f), str(dest_f))
                             log(f"Moved orphan file: {f.name}")
                    
    # 2. Archive from Workstream_ folders if report.md exists
    log("Scanning Workstream_ folders for completed tasks...")
    for ws_dir in DOCS_ROOT.iterdir():
        if ws_dir.is_dir() and ws_dir.name.startswith("Workstream_"):
            for task_dir in ws_dir.iterdir():
                if task_dir.is_dir() and re.match(r"^\d{8}_", task_dir.name):
                    # More lenient: if report.md exists, we assume it's done for archiving purposes
                    if (task_dir / "report.md").exists() or (task_dir / "summary_report.md").exists():
                        move_task(task_dir, ws_dir.name)

    # 3. Update links
    update_process_md()
    
    log("Bulk archiving complete.")

if __name__ == "__main__":
    main()
