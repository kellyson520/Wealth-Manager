import re
from pathlib import Path

# Base paths
BASE_DIR = Path(".").resolve()
DOCS_ROOT = BASE_DIR / "docs"

def log(msg):
    print(f"[LinkUpdater] {msg}")

def update_process_md():
    process_file = DOCS_ROOT / "process.md"
    if not process_file.exists():
        log("process.md not found.")
        return
    
    log("Updating links in process.md...")
    content = ""
    try:
        with open(process_file, "r", encoding="utf-8") as f:
            content = f.read()
    except:
        with open(process_file, "r", encoding="utf-16") as f:
            content = f.read()
            
    # 1. Replace finish with archive
    content = content.replace("/finish/", "/archive/")
    content = content.replace("./finish/", "./archive/")
    
    # 2. Update Workstream dirs to archive/Workstream
    # Patterns: 
    # (docs/Workstream_X/...) -> (docs/archive/Workstream_X/...)
    # (./Workstream_X/...) -> (./archive/Workstream_X/...)
    # ([...](Workstream_X/...)) -> ([...](archive/Workstream_X/...))
    
    workstreams = [d.name for d in DOCS_ROOT.iterdir() if d.is_dir() and d.name.startswith("Workstream_")]
    
    for ws in workstreams:
        # Match Workstream_... followed by a slash and 8 digits
        # This avoid matching the Workstream folder itself if it's the root of a link
        
        # Case 1: (docs/Workstream_X/2026...)
        pattern1 = rf"docs/{ws}/(\d{{8}})"
        content = re.sub(pattern1, rf"docs/archive/{ws}/\1", content)
        
        # Case 2: (./Workstream_X/2026...)
        pattern2 = rf"\./{ws}/(\d{{8}})"
        content = re.sub(pattern2, rf"./archive/{ws}/\1", content)
        
        # Case 3: (Workstream_X/2026...) - relative link without ./
        pattern3 = rf"\]\({ws}/(\d{{8}})"
        content = re.sub(pattern3, rf"](archive/{ws}/\1", content)

    with open(process_file, "w", encoding="utf-8") as f:
        f.write(content)
    log("process.md updated.")

if __name__ == "__main__":
    update_process_md()
