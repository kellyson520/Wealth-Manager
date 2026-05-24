
import os
import shutil

def convert_file(path, dry_run=False):
    full_path = os.path.abspath(path)
    if not os.path.exists(full_path):
        print(f"Skipping {path} (not found)")
        return False

    print(f"Processing {path}...")
    content = None
    decoded_enc = None
    
    # Try reading as UTF-16 (BOM) or LE/BE, or GBK/CP1252
    encodings = ['utf-16', 'utf-16-le', 'gbk', 'cp1252']
    
    for enc in encodings:
        try:
            with open(full_path, 'r', encoding=enc) as f:
                content = f.read()
                # Simple heuristic: if we read as UTF-16LE but it was actually UTF-8, 
                # we might get valid Chinese chars but garbage structure.
                # But usually UTF-8 read as UTF-16 fails or produces garbage.
                print(f"  - Read successfully using {enc}")
                decoded_enc = enc
                break
        except UnicodeError:
            continue
        except Exception as e:
            print(f"  - Error reading as {enc}: {e}")
            
    if content is not None:
        if dry_run:
            print(f"  [DRY RUN] Would save as UTF-8 (from {decoded_enc})")
            return True
            
        try:
            # Backup
            backup_path = full_path + ".bak"
            shutil.copy2(full_path, backup_path)
            
            with open(full_path, 'w', encoding='utf-8') as f:
                f.write(content)
            print(f"  - Saved as UTF-8. Backup at {backup_path}")
            return True
        except Exception as e:
            print(f"  - Error writing: {e}")
            return False
    else:
        print("  - Failed to decode file with any known encoding.")
        return False

if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser(description="Fix non-UTF8 files by converting them to UTF-8")
    parser.add_argument("files", nargs="+", help="Files to fix")
    parser.add_argument("--dry-run", action="store_true", help="Do not modify files")
    
    args = parser.parse_args()
    
    for f in args.files:
        convert_file(f, args.dry_run)
