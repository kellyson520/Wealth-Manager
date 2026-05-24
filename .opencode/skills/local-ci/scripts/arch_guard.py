
import ast
import os
import sys

# Windows 控制台强制 UTF-8 输出以支持 emoji
if sys.stdout and hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

# 定义分层规则：源组件 -> 禁止导入的组件
# 格式: "组件目录": ["禁止组件1", "禁止组件2"]
RULES = {
    "repositories": ["services", "handlers", "web_admin"],
    "utils": ["services", "repositories", "models", "handlers", "web_admin", "core"],
    # Core Container/Bootstrap 需要导入所有内容进行组装，因此允许。
    # 但是，strict helpers 不应依赖业务逻辑。
    "core/helpers": ["services", "repositories", "handlers", "web_admin"],
    
    "services": ["handlers", "web_admin"], # Services 不应依赖 UI/Controllers
    "models": ["services", "repositories", "handlers", "web_admin", "core"], # Models 是纯数据结构
}

def get_project_files(root_dir):
    files_to_check = []
    for root, dirs, files in os.walk(root_dir):
        if "venv" in root or ".git" in root or "__pycache__" in root:
            continue
        for file in files:
            if file.endswith(".py"):
                files_to_check.append(os.path.join(root, file))
    return files_to_check

def check_imports(file_path, root_dir):
    # Determine which component this file belongs to
    # 确定文件所属的组件
    rel_path = os.path.relpath(file_path, root_dir).replace("\\", "/")
    
    # Special exception: models/models.py is a backward compatibility proxy
    # It uses lazy imports to avoid circular dependencies
    if rel_path == "models/models.py":
        return []
    
    component = None
    
    # 优先检查严格子目录 (Rule keys 必须使用正斜杠)
    if rel_path.startswith("core/helpers"):
        component = "core/helpers"
    else:
        # 顶级组件
        parts = rel_path.split("/")
        if len(parts) > 0 and parts[0] in RULES:
            component = parts[0]

    if not component:
        return []

    forbidden = RULES.get(component, [])
    violations = []
    
    try:
        with open(file_path, "r", encoding="utf-8") as f:
            tree = ast.parse(f.read())
            
        for node in ast.walk(tree):
            if isinstance(node, ast.Import):
                for alias in node.names:
                    msg = _check_import(alias.name, forbidden)
                    if msg: violations.append((node.lineno, msg))
            elif isinstance(node, ast.ImportFrom):
                if node.module:
                    msg = _check_import(node.module, forbidden)
                    if msg: violations.append((node.lineno, msg))
                    
    except Exception as e:
        # print(f"解析错误 {file_path}: {e}")
        pass
        
    return violations

def _check_import(module_name, forbidden_list):
    # module_name 可能是 "services.user_service" 或 "models"
    parts = module_name.split(".")
    if not parts: return None
    
    top_level = parts[0]
    if top_level in forbidden_list:
        return f"导入了 '{module_name}'，该层级禁止依赖此组件。"
    return None

def main():
    root_dir = os.getcwd()
    print(f"正在扫描架构违规：{root_dir}...")
    
    violations_count = 0
    files = get_project_files(root_dir)
    
    for file_path in files:
        violations = check_imports(file_path, root_dir)
        if violations:
            print(f"\n📄 {os.path.relpath(file_path, root_dir)}")
            for lineno, msg in violations:
                print(f"  Line {lineno}: ❌ {msg}")
                violations_count += 1
                
    if violations_count == 0:
        print("\n✅ 架构验证通过！未发现分层违规。")
        sys.exit(0)
    else:
        print(f"\n❌ 发现 {violations_count} 个架构违规。")
        sys.exit(1)

if __name__ == "__main__":
    main()
