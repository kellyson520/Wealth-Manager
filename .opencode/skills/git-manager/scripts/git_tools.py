import argparse
import subprocess
import sys
import re
import os
from datetime import datetime
from typing import List, Dict

# --- Configuration & Constants ---
CHANGELOG_FILE = "CHANGELOG.md"
VERSION_FILE = "version.py"

# --- Helpers ---

def get_git_env():
    """Ensure Git output is in English for consistency and UTF-8 handling."""
    env = os.environ.copy()
    env["LC_ALL"] = "C"
    env["LANG"] = "en_US.UTF-8"
    # Windows-specific: ensure Python uses UTF-8 for IO
    env["PYTHONIOENCODING"] = "utf-8"
    return env

def run_git(args: List[str], check: bool = True) -> str:
    """Run git command and return output."""
    try:
        # Force UTF-8 encoding to avoid Windows encoding issues
        # Also force English output for parsing
        result = subprocess.run(
            ["git"] + args, 
            capture_output=True, 
            text=True, 
            encoding='utf-8', 
            check=check,
            env=get_git_env()
        )
        return result.stdout.strip()
    except subprocess.CalledProcessError as e:
        print(f"❌ Git Error ({' '.join(args)}):")
        print(e.stderr)
        if check:
            sys.exit(1)
        return ""

def get_current_branch() -> str:
    return run_git(["rev-parse", "--abbrev-ref", "HEAD"])

def ensure_clean_worktree():
    """Ensure no uncommitted changes exist."""
    status = run_git(["status", "--porcelain"])
    if status:
        print("❌ 工作区不干净 (Working directory not clean). 请先提交或暂存更改。")
        sys.exit(1)

def show_git_log(limit: int = 20):
    """显示最近的 git 提交记录"""
    print(f"\n📜 最近 {limit} 条提交记录:")
    try:
        # Format: hash|time|author|message
        logs = run_git(["log", f"-n {limit}", "--pretty=format:%h | %cd | %an | %s", "--date=format:%Y-%m-%d %H:%M"], check=False).splitlines()
        for i, line in enumerate(logs):
            print(f"[{i}]\t{line}")
        return logs
    except Exception as e:
        print(f"无法获取日志: {e}")
        return []

# --- Core Functions ---

def pull_changes(branch: str = "main", rebase: bool = True):
    print(f"⬇️  正在拉取远程更新 (Branch: {branch})...")
    args = ["pull", "origin", branch]
    if rebase: args.append("--rebase")
    try:
        run_git(args)
        print("✅ 拉取成功 (Up to date).")
    except SystemExit:
        print("⚠️  拉取冲突！请手动解决冲突后运行: git rebase --continue")
        sys.exit(1)

def bump_version(part: str = "patch", extra_msg: str = None):
    if not os.path.exists(VERSION_FILE):
        print(f"⚠️  未找到 {VERSION_FILE}，跳过版本号更新。")
        return

    with open(VERSION_FILE, 'r', encoding='utf-8') as f:
        content = f.read()
    
    match = re.search(r'VERSION\s*=\s*["\'](\d+)\.(\d+)\.(\d+)["\']', content)
    if not match:
        print(f"⚠️  无法在 {VERSION_FILE} 中解析版本号。")
        return

    major, minor, patch = map(int, match.groups())
    
    if part == "major": major += 1; minor = 0; patch = 0
    elif part == "minor": minor += 1; patch = 0
    else: patch += 1
        
    new_version = f"{major}.{minor}.{patch}"
    new_content = re.sub(r'VERSION\s*=\s*["\'].*["\']', f'VERSION = "{new_version}"', content)
    
    with open(VERSION_FILE, 'w', encoding='utf-8') as f:
        f.write(new_content)
        
    print(f"🔖 版本号已升级: {match.group(0)} -> {new_version}")
    
    # 构造 Rich Commit Message
    commit_cmd = ["commit", "-m", f"chore(release): bump version to {new_version}"]
    
    # 添加额外描述信息 (Rich Context)
    if extra_msg:
        commit_cmd.extend(["-m", extra_msg])
    
    run_git(["add", VERSION_FILE])
    run_git(commit_cmd)
    
    # 构造 Rich Tag Message
    tag_msg = f"v{new_version} Release"
    if extra_msg:
        tag_msg += f"\n\n{extra_msg}"
        
    run_git(["tag", "-a", f"v{new_version}", "-m", tag_msg])
    print(f"🏷️  已打标签: v{new_version}")

def generate_changelog(since_tag: str = None) -> List[str]:
    """Generates MD changelog and returns the new content lines for context."""
    try:
        range_spec = f"{since_tag}..HEAD" if since_tag else "HEAD"
        logs = run_git(["log", range_spec, "--pretty=format:%h|%an|%ad|%s", "--date=short"], check=False).splitlines()
    except: logs = []

    categorized: Dict[str, List[str]] = {k: [] for k in ["feat", "fix", "perf", "refactor", "chore", "test", "other"]}
    pattern = re.compile(r"^(\w+)(?:\(([^)]+)\))?:\s*(.+)$")
    
    for line in logs:
        if not line: continue
        parts = line.split("|")
        if len(parts) < 4: continue
        sha, author, date, msg = parts
        match = pattern.match(msg)
        
        # Determine category
        key = "other"
        if match:
            ctype = match.group(1).lower()
            if ctype in categorized: key = ctype
            elif ctype in ["docs", "style"]: key = "chore"
        
        # Display string
        scope = f"**{match.group(2)}**:" if match and match.group(2) else ""
        content = match.group(3) if match else msg
        display = f"- {scope} {content} ({sha}) @{author}"
        categorized[key].append(display)

    # Generate MD Content
    today = datetime.now().strftime('%Y-%m-%d')
    # Title
    md_lines = [f"\n## 📅 {today} 更新摘要\n"]
    
    # Summary of changes for commit message
    summary_lines = []
    
    mapping = [
         ("🚀 新功能", "feat"), 
         ("🐛 修复", "fix"), 
         ("⚡ 性能", "perf"), 
         ("♻️ 重构", "refactor"), 
         ("🔧 工具/文档", "chore"),
         ("🧪 测试", "test"), 
         ("📦 其他", "other")
    ]
    
    has_content = False
    for title, key in mapping:
        if categorized[key]:
            has_content = True
            md_lines.append(f"### {title}")
            for item in categorized[key]:
                 md_lines.append(item)
                 summary_lines.append(f"{title}: {item.split(' @')[0]}") # Simplified for commit msg
            md_lines.append("")

    if not has_content:
        print("⚠️  没有发现新提交，跳过日志。")
        return []

    if os.path.exists(CHANGELOG_FILE):
        with open(CHANGELOG_FILE, 'r', encoding='utf-8') as f: old = f.read()
    else: old = "# Change Log\n\n"
    
    header_end = old.find("\n\n") + 2
    if header_end < 2: header_end = 0
    
    with open(CHANGELOG_FILE, 'w', encoding='utf-8') as f:
        f.write(old[:header_end] + "\n".join(md_lines) + old[header_end:])
        
    print(f"📝 变更日志已写入: {CHANGELOG_FILE}")
    run_git(["add", CHANGELOG_FILE])
    
    return summary_lines

def rollback_menu():
    """Interactive Rollback Menu with History View"""
    print("\n🔙 --- 回滚向导 (Rollback Wizard) ---")
    print("1. 回滚最近 N 个版本 (By Steps)")
    print("2. 选择指定历史版本 (By History/Hash)")
    print("q. 退出 (Quit)")
    
    choice = input("👉 请选择: ").strip()
    if choice == 'q': return

    target_hash = None
    
    if choice == '1':
        steps = input("👉 回滚多少个版本? (默认 1): ").strip() or "1"
        try:
            steps_int = int(steps)
            target_hash = f"HEAD~{steps_int}"
        except ValueError:
            print("❌ 无效数字")
            return
            
    elif choice == '2':
        logs = show_git_log(20)
        sel = input("\n👉 输入目标 Commit Hash (前几位) 或 列表序号 (0-N): ").strip()
        if not sel: return
        
        if sel.isdigit() and int(sel) < len(logs):
            target_hash = logs[int(sel)].split(" | ")[0]
        else:
            target_hash = sel
    
    if not target_hash:
        print("❌ 无效目标")
        return

    print(f"\n🎯 选定目标: {target_hash}")
    mode_input = input("👉 请选择模式 (Soft/Hard/Revert): ").lower().strip()
    
    if mode_input.startswith("r"): # Revert
        print(f"🔙 正在撤销 (Revert) {target_hash}...")
        run_git(["revert", "--no-edit", target_hash], check=False)
        print("✅ Revert 完成。")
        
    elif mode_input.startswith("h") or mode_input.startswith("s"): # Reset
        mode = "hard" if mode_input.startswith("h") else "soft"
        if mode == "hard":
            ans = input(f"🧨 警告: 永久毁灭确认? (yes/no): ")
            if ans != "yes": return
            
        print(f"🔙 正在重置 (Reset --{mode}) 到 {target_hash}...")
        run_git(["reset", f"--{mode}", target_hash])
        print(f"✅ Reset 完成。")

# --- Main CLI ---

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="TG ONE Git Workflow Tools")
    subparsers = parser.add_subparsers(dest="action")
    
    subparsers.add_parser("pull", help="拉取")
    
    r_parser = subparsers.add_parser("release", help="发布")
    r_parser.add_argument("--type", default="patch", help="patch/minor/major")
    r_parser.add_argument("--msg", "-m", help="Release context message. If not provided, auto-generates from stats.", default=None)
    
    subparsers.add_parser("changelog", help="日志")
    subparsers.add_parser("rollback", help="回滚")
    
    args = parser.parse_args()
    
    if args.action == "pull": pull_changes()
    elif args.action == "changelog": generate_changelog()
    elif args.action == "rollback": rollback_menu()
    elif args.action == "release":
        ensure_clean_worktree()
        pull_changes()
        
        # Generates changelog and gets summary
        summary = generate_changelog()
        
        # Commit Changelog separately
        run_git(["commit", "-m", "docs(changelog): update changelog"], check=False)
        
        # Prepare Release Msg
        release_msg = args.msg
        if not release_msg and summary:
             # Auto-compose release message from top 5 changes if not provided
             # Limit to avoid huge commit messages
             release_msg = "Updates:\n" + "\n".join(summary[:10])
             if len(summary) > 10: release_msg += "\n... and more."
        
        bump_version(args.type, release_msg)
        print("\n🎉 发布完成！请运行: git push --follow-tags origin main")
    else:
        parser.print_help()
