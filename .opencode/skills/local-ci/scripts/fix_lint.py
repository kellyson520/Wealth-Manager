import sys
import os
import subprocess
import re
from collections import defaultdict
from typing import List, Dict, Tuple, Optional

def run_flake8(root_dir: str) -> List[str]:
    """Running flake8 to detect F401, F811, F821, and E999"""
    cmd = [
        sys.executable, "-m", "flake8",
        root_dir,
        "--select=F401,F811,F821,E999",
        "--format=%(path)s:%(row)d:%(col)d: %(code)s %(text)s"
    ]
    
    print(f"🔄 Executing Flake8 scan...")
    result = subprocess.run(
        cmd,
        cwd=root_dir,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        encoding='utf-8', 
        errors='replace'
    )
    return result.stdout.strip().splitlines()

def parse_errors(lines: List[str]) -> Dict[str, List[Tuple[int, str, str]]]:
    errors = defaultdict(list)
    # Match: path:row:col: code message
    pattern = re.compile(r"^(.*?):(\d+):(\d+):\s*([EF]\d+)\s*(.*)$")
    
    for line in lines:
        match = pattern.match(line)
        if match:
            path, row, col, code, msg = match.groups()
            errors[path].append((int(row), code, msg))
            
    # Sort errors within file by line number DESCENDING
    for path in errors:
        errors[path].sort(key=lambda x: x[0], reverse=True)
        
    return errors

def extract_name_from_msg(code: str, msg: str) -> Optional[str]:
    """Extract the variable/module name from the error message."""
    if code == 'F401':
        m = re.search(r"'([^']+)' imported but unused", msg)
        return m.group(1) if m else None
    elif code == 'F811':
        m = re.search(r"redefinition of unused '([^']+)'", msg)
        return m.group(1) if m else None
    elif code == 'F821':
        m = re.search(r"undefined name '([^']+)'", msg)
        return m.group(1) if m else None
    return None

def get_missing_import_statement(name: str) -> Optional[str]:
    """Return the import statement for common undefined names."""
    mapping = {
        'asyncio': 'import asyncio',
        'sys': 'import sys',
        'os': 'import os',
        'json': 'import json',
        'time': 'import time',
        're': 'import re',
        'glob': 'import glob',
        'logging': 'import logging',
        'datetime': 'from datetime import datetime',
        'timedelta': 'from datetime import timedelta',
        'List': 'from typing import List',
        'Dict': 'from typing import Dict',
        'Any': 'from typing import Any',
        'Optional': 'from typing import Optional',
        'Tuple': 'from typing import Tuple',
        'Union': 'from typing import Union',
        'Callable': 'from typing import Callable',
        'MagicMock': 'from unittest.mock import MagicMock',
        'patch': 'from unittest.mock import patch',
        'AsyncMock': 'from unittest.mock import AsyncMock',
        'func': 'from sqlalchemy import func',
        'select': 'from sqlalchemy import select',
        'ChromiumPage': 'from DrissionPage import ChromiumPage',
    }
    return mapping.get(name)

def safe_remove_import(line: str, name: str) -> Optional[str]:
    """
    Remove name from import line. 
    If line becomes empty, return None or 'pass' if it was inside a block?
    Actually, we'll return None and handle block safety elsewhere.
    """
    # Simplified logic for removal within a single line
    # Handle 'import X, Y as Z' or 'from M import A, B'
    
    # We want to remove the specific item.
    # Name from flake8 might be 'module.sub' or just 'sub'
    # If it's 'from module import sub', we look for 'sub'
    # If it's 'import module.sub', we look for 'module.sub'
    
    # Use word boundaries and handle aliases
    safe_name = re.escape(name.split('.')[-1]) # often flake8 uses full path, but we see the alias or name
    
    # Check for alias: 'target as name'
    p_alias = r'[\w\.]+\s+as\s+' + safe_name + r'\b'
    # Check for simple: 'name'
    p_simple = r'\b' + safe_name + r'\b'
    
    new_line = line
    if re.search(p_alias, line):
        pattern = p_alias
    elif re.search(p_simple, line):
        pattern = p_simple
    else:
        return line

    # Cases:
    # 1. item,
    # 2. , item
    # 3. (item,
    # 4. , item)
    # 5. item
    
    # We try to remove item and surrounding comma
    new_line = re.sub(pattern + r'\s*,', '', new_line)
    new_line = re.sub(r',\s*' + pattern, '', new_line)
    new_line = re.sub(pattern, '', new_line)
    
    # Clean up empty parens or trailing spaces
    cleaned = new_line.strip()
    
    # If it's a naked 'import ' or 'from x import ' or 'import ()'
    if re.match(r'^(from\s+[\w\.]+\s+)?import\s*\(?\s*\)?\s*$', cleaned):
        return None
        
    return new_line

def fix_file(file_path: str, file_errors: List[Tuple[int, str, str]]):
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            lines = f.readlines()
    except Exception as e:
        print(f"❌ Error reading {file_path}: {e}")
        return

    modified = False
    # Sort errors descending by row to allow line manipulation
    file_errors.sort(key=lambda x: x[0], reverse=True)
    
    missing_imports = set()
    lines_to_delete = set()
    
    # Pass 1: Handle F401/F811 (Removals)
    for row, code, msg in file_errors:
        if code not in ['F401', 'F811']: continue
        
        target_name = extract_name_from_msg(code, msg)
        if not target_name: continue
        
        # Flake8 row is 1-indexed
        idx = row - 1
        if idx >= len(lines): continue
        
        # Optimization: check if this is an import in a try/except block that is meant as a test
        # We look up 1 line
        if idx > 0 and 'try:' in lines[idx-1]:
            # This is likely a 'try: import X except: ...' pattern.
            # Don't remove if it's the only thing in the try block
            print(f"  ⚠️ Skipping {target_name} in {os.path.basename(file_path)}:{row} (Try/Except block safety)")
            continue

        # Look for the name in the line or following lines (multi-line import)
        found_idx = -1
        # Search a few lines ahead in case flake8 points to the ( in multi-line
        for i in range(idx, min(len(lines), idx + 20)):
            if re.search(r'\b' + re.escape(target_name.split('.')[-1]) + r'\b', lines[i]):
                found_idx = i
                break
        
        if found_idx != -1:
            new_line = safe_remove_import(lines[found_idx], target_name)
            if new_line is None:
                # Instead of immediate delete, mark for cleanup
                # Check if deletion would break a block
                indent = lines[found_idx][:len(lines[found_idx]) - len(lines[found_idx].lstrip())]
                # If the line before or after has higher indent or it's follow by except?
                # Actually, simply replacing with 'pass' is safer than delete if it's indented
                if indent:
                    lines[found_idx] = indent + "pass\n"
                else:
                    lines_to_delete.add(found_idx)
                modified = True
            elif new_line != lines[found_idx]:
                lines[found_idx] = new_line
                modified = True
                
    # Pass 2: Handle F821 (Additions)
    for row, code, msg in file_errors:
        if code != 'F821': continue
        
        target_name = extract_name_from_msg(code, msg)
        if not target_name: continue
        
        stmt = get_missing_import_statement(target_name)
        if stmt:
             # Only add if not already in file (crude check)
             if not any(stmt in l for l in lines):
                 missing_imports.add(stmt)
                 modified = True
    
    # Pass 3: Handle E999 (Syntax Errors - rudimentary)
    for row, code, msg in file_errors:
        if code != 'E999': continue
        if "IndentationError: expected an indented block" in msg:
            idx = row - 1
            if idx < len(lines):
                 indent = "    " # Default
                 if idx > 0:
                     prev = lines[idx-1]
                     indent = prev[:len(prev) - len(prev.lstrip())] + "    "
                 lines.insert(idx, indent + "pass\n")
                 modified = True

    # Finalize File
    if modified:
        # Perform deletions in reverse order
        for idx in sorted(lines_to_delete, reverse=True):
            lines.pop(idx)
        
        if missing_imports:
            # Insert at top, but after docstring
            insert_idx = 0
            if lines and lines[0].strip().startswith(('"""', "'''")):
                for i in range(1, len(lines)):
                    if lines[i].strip().endswith(('"""', "'''")):
                        insert_idx = i + 1
                        break
            
            for stmt in sorted(missing_imports, reverse=True):
                lines.insert(insert_idx, stmt + "\n")
        
        with open(file_path, 'w', encoding='utf-8') as f:
            f.writelines(lines)
        return True
    return False

def main():
    root_dir = os.getcwd()
    print(f"📂 Scanning {root_dir}...")
    
    flake_lines = run_flake8(root_dir)
    errors_by_file = parse_errors(flake_lines)
    
    if not errors_by_file:
        print("🎉 No lint issues found!")
        return

    total_fixed = 0
    total_files = len(errors_by_file)
    print(f"🧐 Found issues in {total_files} files.")

    for file_path, errors in errors_by_file.items():
        # Ensure absolute path
        abs_path = os.path.join(root_dir, file_path) if not os.path.isabs(file_path) else file_path
        if not os.path.exists(abs_path): continue
        
        print(f"🔧 Processing {file_path}...")
        if fix_file(abs_path, errors):
            total_fixed += 1
            
    print(f"\n✅ Done. Modified {total_fixed} files.")

if __name__ == "__main__":
    main()
