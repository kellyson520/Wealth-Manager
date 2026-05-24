
import os
import argparse

def is_suspicious(text):
    # Common mojibake patterns
    # "Ã©" is often 'é' from UTF-8 viewed as Latin-1
    suspicious_substrings = ["Ã©", "Ã¤", "Ã¼", "ä¸", "å", "æ", "è", "ï¿½"]
    # Common GBK Mojibake (UTF-8 bytes viewed as GBK)
    # 鍘 (History), 锟 (Replacement), 氓 (mang), 锛 (comma), 辎, 锘 (BOM)
    suspicious_gbk = ["鍘", "锟", "氓", "锛", "辎", "锘"]

    
    count = 0
    for s in suspicious_substrings:
        if s in text:
            count += text.count(s)
            
    for s in suspicious_gbk:
        if s in text:
            count += text.count(s) * 2 # Weight these higher

            
    if "ï¿½" in text:
         return True, "Contains Replacement Char (ï¿½)"
         
    # High frequency of these chars might indicate Mojibake
    if "ä¸" in text and len(text) < 5000:
         return True, "Potential UTF-8 as Latin-1 (ä¸)"

    if any(s in text for s in suspicious_gbk):
         return True, "Potential UTF-8 as GBK (e.g. 鍘/锟)"


    if count > 0:
        return True, f"Suspicious chars count: {count}"
        
    return False, ""

def scan(root_dir, verbose=False):
    if verbose:
        print(f"Scanning {root_dir}...")
    
    issues = []
    
    # Files to ignore
    ignore_dirs = {'.git', '.agent', '__pycache__', 'venv', 'node_modules', '.idea', '.vscode'}
    extensions = {'.py', '.md', '.txt', '.json', '.yml', '.yaml', '.sh', '.bat', '.ps1', '.css', '.html', '.js'}

    for root, dirs, files in os.walk(root_dir):
        # Modify dirs in-place to skip
        dirs[:] = [d for d in dirs if d not in ignore_dirs]
        
        for file in files:
            ext = os.path.splitext(file)[1].lower()
            if ext not in extensions:
                continue
                
            path = os.path.join(root, file)
            try:
                with open(path, 'r', encoding='utf-8') as f:
                    content = f.read()
                    suspicious, reason = is_suspicious(content)
                    if suspicious:
                         print(f"[SUSPICIOUS] {path} -> {reason}")
                         issues.append((path, 'suspicious', reason))
            except UnicodeDecodeError:
                print(f"[NON-UTF8]   {path}")
                issues.append((path, 'non-utf8', 'UnicodeDecodeError'))
            except Exception as e:
                if verbose:
                    print(f"[ERROR]      {path} -> {e}")

    if not issues:
        print("No encoding issues found.")
    else:
        print(f"\nFound {len(issues)} issues.")

    return issues

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Scan for encoding issues")
    parser.add_argument("root", nargs="?", default=".", help="Root directory to scan")
    parser.add_argument("--verbose", "-v", action="store_true", help="Verbose output")
    args = parser.parse_args()
    
    scan(args.root, args.verbose)
