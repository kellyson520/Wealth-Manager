import os
import re
import sys
import subprocess
from datetime import datetime

# Configuration
GRADLE_FILE = "app/build.gradle.kts"
CHANGELOG_FILE = "CHANGELOG.md"
DOCS_DIR = "docs"

def get_git_env():
    """Ensure Git output is in English for consistency and UTF-8 handling."""
    env = os.environ.copy()
    env["LC_ALL"] = "C"
    env["LANG"] = "en_US.UTF-8"
    # Windows-specific: ensure Python uses UTF-8 for IO
    env["PYTHONIOENCODING"] = "utf-8"
    return env

def run_command(args, check=True, capture=True):
    """Refined command runner with environment support."""
    try:
        # Use full path for git if possible, but usually 'git' is fine in PATH
        result = subprocess.run(
            args, 
            capture_output=capture, 
            text=True, 
            check=check, 
            encoding='utf-8',
            env=get_git_env()
        )
        return result.stdout.strip() if capture else ""
    except subprocess.CalledProcessError as e:
        print(f"❌ Error running command {' '.join(args)}:")
        print(e.stderr if capture else "Check terminal output above.")
        if check:
            sys.exit(1)
        return e.stderr if capture else ""

def optimize_git_configs():
    """Apply optimizations for large repos and unstable networks (from smart_push)."""
    configs = [
        ("http.postBuffer", "524288000"), # 500MB
        ("http.lowSpeedLimit", "0"),
        ("http.lowSpeedTime", "999999"),
        ("core.compression", "0"),
    ]
    print("🛠️  正在应用 Git 网络优化配置...")
    for key, val in configs:
        subprocess.run(["git", "config", key, val], check=False, env=get_git_env())

def fix_privacy_email():
    """Ensure user email is set to noreply to avoid GitHub privacy blocks."""
    try:
        user_name = run_command(["git", "config", "user.name"])
        noreply = f"{user_name}@users.noreply.github.com"
        print(f"🔒 隐私保护: 自动切换邮箱至 {noreply}")
        run_command(["git", "config", "user.email", noreply])
        # Only amend if we just committed (dangerous if not handled carefully, but 
        # usually one_stop_release runs after local changes are ready).
    except Exception as e:
        print(f"⚠️ 无法自动修复隐私信息: {e}")

def get_latest_report():
    """Find the most recent report.md in Workstream folders."""
    reports = []
    for root, dirs, files in os.walk(DOCS_DIR):
        if "Workstream_" in root and "report.md" in files:
            mtime = os.path.getmtime(os.path.join(root, "report.md"))
            reports.append((mtime, os.path.join(root, "report.md")))
    
    if not reports:
        return None
    
    # Sort by modification time descending
    reports.sort(key=lambda x: x[0], reverse=True)
    return reports[0][1]

def parse_report(report_path):
    """Extract summary and details from report.md."""
    if not report_path:
        return "Manual update required", []
    
    with open(report_path, 'r', encoding='utf-8') as f:
        content = f.read()
    
    summary_match = re.search(r'## 任务摘要 \(Summary\)\n(.*?)\n', content, re.DOTALL)
    summary = summary_match.group(1).strip() if summary_match else "Performance improvement and fixes"
    
    # Find all bullet points in details section
    details = re.findall(r'\*   (.*?)\n', content)
    if not details:
        details = re.findall(r'- (.*?)\n', content)
    
    return summary, details

def update_changelog(version, summary, details):
    """Prepend new version entry to CHANGELOG.md if it doesn't exist."""
    today = datetime.now().strftime('%Y-%m-%d')
    version_header = f"## [{version}]"
    
    if os.path.exists(CHANGELOG_FILE):
        with open(CHANGELOG_FILE, 'r', encoding='utf-8') as f:
            old_content = f.read()
    else:
        old_content = "# Changelog\n\nAll notable changes to this project will be documented in this file.\n\n"

    # Avoid duplicate version entry at the top
    if version_header in old_content[:500]:
        print(f"⚠️  Changelog already contains an entry for {version}. Skipping update.")
        return

    new_entry = f"{version_header} - {today}\n\n### Added/Fixed\n"
    new_entry += f"- **Summary**: {summary}\n"
    for detail in details:
        new_entry += f"- {detail.strip()}\n"
    new_entry += "\n"
    
    # Prepend after header (first ##)
    insertion_point = old_content.find("##")
    if insertion_point == -1:
        updated_content = old_content + "\n" + new_entry
    else:
        updated_content = old_content[:insertion_point] + new_entry + old_content[insertion_point:]
        
    with open(CHANGELOG_FILE, 'w', encoding='utf-8') as f:
        f.write(updated_content)

def bump_version(bump_type="patch"):
    """Update versionCode and versionName in build.gradle.kts."""
    if not os.path.exists(GRADLE_FILE):
        print(f"Error: {GRADLE_FILE} not found")
        sys.exit(1)
        
    with open(GRADLE_FILE, 'r', encoding='utf-8') as f:
        content = f.read()
        
    vcode_match = re.search(r'versionCode\s*=\s*(\d+)', content)
    vname_match = re.search(r'versionName\s*=\s*"(.*?)"', content)
    
    if not vcode_match or not vname_match:
        print("Error: Could not find versionCode or versionName in gradle file")
        sys.exit(1)
        
    old_code = int(vcode_match.group(1))
    old_name = vname_match.group(1)
    
    # Bump versionCode
    new_code = old_code + 1
    
    # Bump versionName
    parts = old_name.split('.')
    while len(parts) < 3:
        parts.append('0')
    
    major, minor, patch = map(int, parts[:3])
    if bump_type == "major":
        major += 1
        minor = 0
        patch = 0
    elif bump_type == "minor":
        minor += 1
        patch = 0
    else:
        patch += 1
    
    new_name = f"{major}.{minor}.{patch}"
    
    new_content = re.sub(r'versionCode\s*=\s*\d+', f'versionCode = {new_code}', content)
    new_content = re.sub(r'versionName\s*=\s*".*?"', f'versionName = "{new_name}"', new_content)
    
    with open(GRADLE_FILE, 'w', encoding='utf-8') as f:
        f.write(new_content)
        
    return new_name

def smart_push_tag(remote, branch, tag_name, summary, force=False):
    """Smart push logic for both code and tags with diagnostic support."""
    optimize_git_configs()
    print(f"📤 正在推送到 {remote} 的 {branch} 分支及标签 {tag_name}...")
    
    # Push main branch
    push_args = ["git", "push", "-u", remote, branch]
    if force: push_args.append("--force")
    
    try:
        run_command(push_args, check=True, capture=False)
        
        # Push tag
        tag_args = ["git", "push", remote, tag_name]
        if force: tag_args.append("--force")
        run_command(tag_args, check=True, capture=False)
        
        print(f"✅ 成功发布版本 {tag_name}!")
        return True
    except Exception:
        # Diagnostic already printed in run_command error block
        print("\n💡 建议检查网络或远程分支状态。如果遇到隐私拦截，请尝试使用 --privacy-fix。")
        return False

def main():
    import argparse
    parser = argparse.ArgumentParser(description="One-stop Release Script (Unified with Smart Push)")
    parser.add_argument("--type", choices=["major", "minor", "patch"], default="patch", help="Version bump type")
    parser.add_argument("--dry-run", action="store_true", help="Don't perform git actions")
    parser.add_argument("--no-bump", action="store_true", help="Keep current version")
    parser.add_argument("--force", action="store_true", help="Force push")
    parser.add_argument("--privacy-fix", action="store_true", help="Auto-switch to noreply email")
    parser.add_argument("--remote", default="origin", help="Remote name")
    parser.add_argument("--branch", default="main", help="Branch name")
    
    args = parser.parse_args()
    
    print("🚀 启动自动化发布流程 (一条龙)...")
    
    # 0. Privacy Fix if requested
    if args.privacy_fix:
        fix_privacy_email()
    
    # 1. Sync Logs
    print("📝 正在分析工作流报告...")
    report_path = get_latest_report()
    summary, details = parse_report(report_path)
    print(f"   📊 识别报告: {report_path if report_path else '未找到报告'}")
    
    # 2. Bump Version
    print("🔖 正在更新版本号...")
    if args.no_bump:
        with open(GRADLE_FILE, 'r', encoding='utf-8') as f:
            vname_match = re.search(r'versionName\s*=\s*"(.*?)"', f.read())
            new_version = vname_match.group(1) if vname_match else "unknown"
        print(f"   ✅ 保持版本不变: {new_version}")
    else:
        new_version = bump_version(args.type)
        print(f"   ✨ 新版本: {new_version}")
    
    # 3. Update Changelog
    print(f"📝 正在更新 {CHANGELOG_FILE}...")
    update_changelog(new_version, summary, details)
    
    if args.dry_run:
        print("🛑 模拟模式已启用，跳过 Git 提交与推送步骤。")
        return

    # 4. Git Process
    print("📦 正在准备 Git 提交...")
    run_command(["git", "add", "."])
    
    commit_msg = f"chore(release): v{new_version}\n\n{summary}"
    run_command(["git", "commit", "-m", commit_msg])
    
    tag_name = f"v{new_version}"
    # Check duplicate tags
    existing_tags = run_command(["git", "tag", "-l", tag_name])
    if tag_name in existing_tags.split():
        print(f"⚠️  标签 {tag_name} 已存在，正在删除并重新创建...")
        run_command(["git", "tag", "-d", tag_name])
    
    run_command(["git", "tag", "-a", tag_name, "-m", f"Release {tag_name}: {summary}"])
    
    # 5. Smart Push integration
    smart_push_tag(args.remote, args.branch, tag_name, summary, force=args.force)

if __name__ == "__main__":
    main()
