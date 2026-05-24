import os
import shutil
from pathlib import Path

# 定义根目录白名单
WHITELIST_DIRS = {
    'src', 'docs', 'tests', '.agent', '.github', '.vscode', '.git',
    'models', 'services', 'utils', 'handlers', 'core', 'web_admin',
    'db', 'migrations', 'alembic', 'logs', 'config', 'enums', 'schemas',
    'repositories', 'listeners', 'filters', 'scheduler', 'middlewares',
    'templates', 'static', 'sessions', 'temp_files',
    'ai', 'api', 'controllers', 'rss', 'ui', 'zhuanfaji', 'data',
    'managers', 'scripts', 'ufb',
    # Android specific
    'app', 'gradle', '.gradle', '.idea', 'build', 'libs'
}

WHITELIST_FILES = {
    '.gitignore', '.dockerignore', '.secret_key', 'requirements.txt', 'AGENTS.md', 'README.md',
    'version.py', 'main.py', 'pytest.ini', 'alembic.ini', 'docker-compose.yml', 'Dockerfile',
    'pyproject.toml', 'setup.py', '.env', '.env.example', 'todo.md', 
    'process.md', 'GEMINI.md',
    # Android specific
    'build.gradle.kts', 'settings.gradle.kts', 'gradlew', 'gradlew.bat',
    'local.properties', 'gradle.properties', 'google-services.json',
    'build.sh', 'quick-build.sh', 'focusflow.jks'
}

# 允许的后缀名（针对某些配置）
WHITELIST_EXTENSIONS = {'.md', '.yml', '.yaml', '.ini', '.txt', '.json', '.jks'}

def check_hygiene(root_dir, auto_fix=False):
    root = Path(root_dir)
    pollution = []
    
    # 确保 tests/temp 存在
    temp_dir = root / 'tests' / 'temp'
    os.makedirs(temp_dir, exist_ok=True)

    for item in root.iterdir():
        # 如果是目录
        if item.is_dir():
            if item.name not in WHITELIST_DIRS:
                pollution.append(item)
        # 如果是文件
        else:
            if item.name in WHITELIST_FILES:
                continue
            if item.suffix in WHITELIST_EXTENSIONS:
                continue
            
            # 排除已有的 .log (通常根目录不该有，但有些系统会生成)
            pollution.append(item)

    if not pollution:
        print("✅ Workspace is clean! No pollution found in root.")
        return

    print(f"⚠️ Found {len(pollution)} polluting items in root:")
    for p in pollution:
        print(f"  - {p.relative_to(root)}")

    if auto_fix:
        print("\n🚀 Starting auto-cleanup...")
        for p in pollution:
            target = temp_dir / p.name
            try:
                # 如果目标已存在，序号递增
                counter = 1
                while target.exists():
                    target = temp_dir / f"{p.stem}_{counter}{p.suffix}"
                    counter += 1
                
                shutil.move(str(p), str(target))
                print(f"  📦 Moved {p.name} -> tests/temp/{target.name}")
            except Exception as e:
                print(f"  ❌ Failed to move {p.name}: {e}")

if __name__ == "__main__":
    # 获取项目根目录 (假设脚本在 .agent/skills/workspace-hygiene/scripts/)
    project_root = Path(__file__).resolve().parent.parent.parent.parent.parent
    check_hygiene(project_root, auto_fix=True)
