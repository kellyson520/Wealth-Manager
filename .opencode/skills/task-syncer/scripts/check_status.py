import sys
import os
import re

def check_status(todo_path):
    if not os.path.exists(todo_path):
        print(f"Error: File {todo_path} not found.")
        return

    with open(todo_path, 'r', encoding='utf-8') as f:
        lines = f.readlines()

    extensions = {'.py', '.md', '.json', '.js', '.css', '.html', '.sh', '.yaml', '.yml', '.txt'}
    
    print(f"--- Analyzing {os.path.basename(todo_path)} ---")
    
    warnings = []
    suggestions = []

    for i, line in enumerate(lines):
        line = line.strip()
        if not line.startswith('- ['):
            continue
        
        is_checked = line.startswith('- [x]')
        content = line[5:].strip()
        
        # Extract potential filenames
        # Priority 1: Backticked content
        potential_files = re.findall(r'`([^`]+)`', content)
        
        # Priority 2: Words that look like files
        words = content.split()
        for word in words:
            # Clean punctuation
            clean_word = word.strip(".,;:()[]'\"")
            root, ext = os.path.splitext(clean_word)
            if ext in extensions and clean_word not in potential_files:
                potential_files.append(clean_word)

        found_files = []
        missing_files = []

        for p in potential_files:
            # Normalize path
            # Try 1: Relative to CWD (Project Root)
            if os.path.exists(p):
                found_files.append(p)
                continue
            
            # Try 2: Relative to todo.md location? (Less likely for code, but possible for docs)
            rel_to_doc = os.path.join(os.path.dirname(todo_path), p)
            if os.path.exists(rel_to_doc):
                found_files.append(p) # Store original name for display
                continue
            
            # Not found
            missing_files.append(p)

        if not potential_files:
            continue

        # Logic for Suggestion
        # Case A: Unchecked but ALL files exist -> Suggest Complete
        if not is_checked and found_files and not missing_files:
             suggestions.append(f"[Line {i+1}] Task '{content[:30]}...' is unchecked, but {found_files} exist. -> SUGGEST: [x]")
        
        # Case B: Checked but ANY file missing -> Suggest Revert
        if is_checked and missing_files:
             # Be careful, maybe it was deleted? But safe to warn.
             warnings.append(f"[Line {i+1}] Task '{content[:30]}...' is checked, but {missing_files} are missing. -> CHECK: [ ]")

    print(f"\nFound {len(suggestions)} suggestions to Mark as Done:")
    for s in suggestions:
        print(f"  ✅ {s}")

    print(f"\nFound {len(warnings)} potential Hallucinations (Marked done but missing):")
    for w in warnings:
        print(f"  ⚠️ {w}")

    if not suggestions and not warnings:
        print("\nAll tasks seem synchronized with file existence.")

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python check_status.py <path_to_todo.md>")
        sys.exit(1)
    
    check_status(sys.argv[1])
