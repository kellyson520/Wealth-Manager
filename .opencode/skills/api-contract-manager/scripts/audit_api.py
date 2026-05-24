import os
import re
from pathlib import Path

# Configuration
PROJECT_ROOT = Path(os.getcwd())
# BACKEND_DIR = PROJECT_ROOT / "src" / "application" / "api" # Old path
BACKEND_DIR = PROJECT_ROOT / "web_admin" # Correct path
FRONTEND_DIRS = [
    PROJECT_ROOT / "web_admin" / "templates",
    PROJECT_ROOT / "web_admin" / "static" / "js"
]

# Patterns
# Match: @router.get("/users/{id}", ...) or @app.post('/login')
BACKEND_PATTERN = re.compile(r'@(?:router|app)\.(get|post|put|delete|patch)\s*\(\s*["\']([^"\']+)["\']')
# Match: router = APIRouter(prefix="/users")
PREFIX_PATTERN = re.compile(r'router\s*=\s*APIRouter\s*\([^)]*prefix=["\']([^"\']+)["\']')

# Match: apiManager.get('/api/users') or fetch('/api/data')
# We look for strings starting with /api/ or /auth/
FRONTEND_PATTERN = re.compile(r'["\']((?:/api|/auth|/system|/stats|/security)[^"\']*)["\']')

def scan_backend():
    endpoints = []
    for root, _, files in os.walk(BACKEND_DIR):
        for file in files:
            if not file.endswith(".py"):
                continue
            
            path = Path(root) / file
            try:
                content = path.read_text(encoding='utf-8')
                
                # Try to find prefix
                prefix = ""
                prefix_match = PREFIX_PATTERN.search(content)
                if prefix_match:
                    prefix = prefix_match.group(1)
                
                # Find routes
                for match in BACKEND_PATTERN.finditer(content):
                    method, route = match.groups()
                    full_route = (prefix + route).replace('//', '/')
                    endpoints.append({
                        "method": method.upper(),
                        "path": full_route,
                        "file": str(path.relative_to(PROJECT_ROOT))
                    })
            except Exception as e:
                print(f"Error reading {path}: {e}")
    return endpoints

def scan_frontend():
    calls = []
    for directory in FRONTEND_DIRS:
        if not directory.exists():
            continue
        for root, _, files in os.walk(directory):
            for file in files:
                if not (file.endswith(".html") or file.endswith(".js")):
                    continue
                
                path = Path(root) / file
                try:
                    content = path.read_text(encoding='utf-8')
                    row_num = 0
                    for line in content.splitlines():
                        row_num += 1
                        # Find API calls
                        for match in FRONTEND_PATTERN.finditer(line):
                            api_path = match.group(1)
                            # Basic cleaning of template variables like ${id} -> {id}
                            # simple heuristic: replace ${...} with {param} or just ignore strict matching for now
                            calls.append({
                                "path": api_path,
                                "file": str(path.relative_to(PROJECT_ROOT)),
                                "line": row_num,
                                "raw": line.strip()
                            })
                except Exception as e:
                    print(f"Error reading {path}: {e}")
    return calls

def normalize_path(path):
    # /users/{id} vs /users/${id} vs /users/1
    # Replace {variable} and ${variable} with *
    path = re.sub(r'\{[^}]+\}', '*', path)
    path = re.sub(r'\$\{[^}]+\}', '*', path)
    return path

def main():
    print("🔍 Starting API Contract Audit...")
    print(f"📂 Project Root: {PROJECT_ROOT}")
    
    backend_eps = scan_backend()
    frontend_calls = scan_frontend()
    
    print(f"\n✅ Found {len(backend_eps)} Backend Endpoints")
    print(f"✅ Found {len(frontend_calls)} Frontend API Calls")
    
    # Analysis
    be_map = {normalize_path(ep['path']): ep for ep in backend_eps}
    
    print("\n" + "="*60)
    print("🚩 POTENTIAL ISSUES (Frontend calls that don't match Backend)")
    print("="*60)
    
    issues_found = 0
    valid_links = 0
    
    for call in frontend_calls:
        norm_call = normalize_path(call['path'])
        
        # Exact match check first
        match = be_map.get(norm_call)
        
        # Try prepending /api if not found and doesn't start with /api
        if not match and not norm_call.startswith('/api'):
            match = be_map.get('/api' + norm_call)
        
        # Try prepending /api if it DOES start with /api (some calls might be relative)
        # Actually apiManager base is /api. So apiManager.get('/users') -> /api/users
        # But fetch('/api/users') -> /api/users
        
        if not match:
            # Fuzzy match (maybe query params?)
            possible = [k for k in be_map.keys() if norm_call.startswith(k.replace('*', ''))]
            if not possible:
                print(f"❌ [404?] {call['path']}")
                print(f"   ↳ in {call['file']}:{call['line']}")
                print(f"   ↳ Code: {call['raw']}")
                issues_found += 1
            else:
                valid_links += 1
        else:
            valid_links += 1
    
    if issues_found == 0:
        print(f"\n🎉 No broken links found! ({valid_links} verified connections)")
    else:
        print(f"\n⚠️ Found {issues_found} potential broken links.")

    print("\n" + "="*60)
    print("📋 BACKEND ENDPOINT INVENTORY")
    print("="*60)
    
    # Generate Persistent Report
    report_path = PROJECT_ROOT / "docs" / "API_CONTRACT.md"
    report_path.parent.mkdir(exist_ok=True, parents=True)
    
    with open(report_path, 'w', encoding='utf-8') as f:
        f.write("# API Contract Status Report\n")
        f.write(f"**Last Scan:** {os.environ.get('USERNAME', 'Auto-System')} (Automated)\n\n")
        f.write("## Summary\n")
        f.write(f"- **Backend Endpoints**: {len(backend_eps)}\n")
        f.write(f"- **Frontend Calls**: {len(frontend_calls)}\n")
        f.write(f"- **Health**: {'✅ Excellent' if issues_found == 0 else '⚠️ Needs Attention'}\n\n")
        
        f.write("## Backend Inventory\n| Method | Path | Source File |\n|---|---|---|\n")
        for ep in sorted(backend_eps, key=lambda x: x['path']):
            f.write(f"| {ep['method']} | `{ep['path']}` | `{ep['file']}` |\n")
            print(f"[{ep['method']}] {ep['path']}  (defined in {ep['file']})")
    
    print(f"\n📄 Report generated at: {report_path}")

if __name__ == "__main__":
    main()
