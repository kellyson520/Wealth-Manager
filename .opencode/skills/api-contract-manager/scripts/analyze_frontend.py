"""
前后端连接修复脚本
自动将前端页面中的直接 fetch 调用替换为 apiManager 调用
"""

import re
import os
from pathlib import Path

# 使用当前工作目录作为项目根目录
PROJECT_ROOT = Path(os.getcwd())
TEMPLATES_DIR = PROJECT_ROOT / "web_admin" / "templates"

# 需要修复的文件列表
TARGET_FILES = [
    "rules.html",
    "users.html", 
    "audit_logs.html",
    "tasks.html",
    "logs.html",
    "dashboard.html",
    "index.html"
]

def analyze_fetch_calls(content):
    """分析文件中的 fetch 调用"""
    # 匹配 fetch('/api/...')  或 fetch(`/api/...`)
    pattern = r'fetch\s*\(\s*[\'"`](/api/[^\'"` ]+)[\'"`]'
    matches = re.findall(pattern, content)
    return matches

def generate_report():
    """生成分析报告"""
    print("=" * 60)
    print("前端 API 调用分析报告")
    print("=" * 60)
    
    total_issues = 0
    
    for filename in TARGET_FILES:
        filepath = TEMPLATES_DIR / filename
        if not filepath.exists():
            print(f"\n⚠️  {filename} - 文件不存在")
            continue
            
        content = filepath.read_text(encoding='utf-8')
        fetch_calls = analyze_fetch_calls(content)
        
        if fetch_calls:
            print(f"\n📄 {filename}")
            print(f"   发现 {len(fetch_calls)} 个直接 fetch 调用:")
            for call in fetch_calls:
                print(f"   - {call}")
                total_issues += 1
        else:
            print(f"\n✅ {filename} - 无需修复")
    
    print("\n" + "=" * 60)
    print(f"总计: {total_issues} 个需要修复的调用")
    print("=" * 60)
    
    return total_issues

def suggest_fixes(content):
    """建议修复方案"""
    suggestions = []
    
    # 检测常见模式
    patterns = {
        r"fetch\('/api/rules": "使用 apiManager.get('/rules')",
        r"fetch\('/api/users": "使用 apiManager.get('/users')",
        r"fetch\('[^']+',\s*\{\s*method:\s*'POST'": "使用 apiManager.post()",
        r"fetch\('[^']+',\s*\{\s*method:\s*'PUT'": "使用 apiManager.put()",
        r"fetch\('[^']+',\s*\{\s*method:\s*'DELETE'": "使用 apiManager.delete()",
    }
    
    for pattern, suggestion in patterns.items():
        if re.search(pattern, content):
            suggestions.append(suggestion)
    
    return suggestions

if __name__ == "__main__":
    total = generate_report()
    
    if total > 0:
        print("\n💡 修复建议:")
        print("1. 将所有 fetch() 调用替换为 apiManager 方法")
        print("2. 添加 try-catch 错误处理")
        print("3. 使用 notificationManager 显示用户反馈")
        print("4. 使用 loadingManager 管理加载状态")
        print("\n参考模板: docs/Frontend_Backend_Integration_Plan.md")
