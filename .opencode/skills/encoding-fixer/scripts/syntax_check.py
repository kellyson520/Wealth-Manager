
import sys
import ast
import os

def check_syntax(file_path):
    """
    检查 Python 文件的语法错误，返回布尔值。
    """
    if not file_path.endswith('.py'):
        print(f"[SKIP] Not a Python file: {file_path}")
        return True

    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            content = f.read()
        compile(content, file_path, 'exec')
        # 尝试 ast 解析，能捕获更多细致错误
        ast.parse(content, filename=file_path)
        print(f"[OK] Syntax valid: {file_path}")
        return True
    except SyntaxError as e:
        print(f"[FAIL] SyntaxError in {file_path}: {e}")
        print(f"       Line {e.lineno}: {e.text.strip() if e.text else ''}")
        return False
    except IndentationError as e:
        print(f"[FAIL] IndentationError in {file_path}: {e}")
        print(f"       Line {e.lineno}: {e.text.strip() if e.text else ''}")
        return False
    except Exception as e:
        print(f"[ERROR] Checking {file_path}: {e}")
        return False

def main():
    if len(sys.argv) < 2:
        print("Usage: python syntax_check.py <file_path> [file_path2 ...]")
        return
    
    failed_count = 0
    for path in sys.argv[1:]:
        if os.path.isdir(path):
            # Recursively check directory
            for root, _, files in os.walk(path):
                for file in files:
                    if file.endswith(".py"):
                        if not check_syntax(os.path.join(root, file)):
                            failed_count += 1
        else:
            if not check_syntax(path):
                failed_count += 1
    
    if failed_count > 0:
        print(f"\nFound {failed_count} files with syntax errors.")
        sys.exit(1)
    else:
        print("\nAll files passed syntax check.")
        sys.exit(0)

if __name__ == "__main__":
    main()
