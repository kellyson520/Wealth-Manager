import argparse
import subprocess
import sys
import os
import time
from datetime import datetime
from pathlib import Path

# 颜色定义
GREEN = "\033[92m"
RED = "\033[91m"
YELLOW = "\033[93m"
CYAN = "\033[96m"
RESET = "\033[0m"

def print_header(msg):
    print(f"\n{CYAN}{'='*60}\n{msg}\n{'='*60}{RESET}")

def run_command_stream(cmd, cwd=None, timeout=None, report_desc="Verify"):
    """
    执行命令并实时流式输出结果，同时保存日志到 tests/temp/reports/。
    """
    print(f"{YELLOW}Executing: {cmd}{RESET}")
    start_time = time.time()
    
    # 构建日志路径
    report_dir = os.path.join(cwd or os.getcwd(), "tests", "temp", "reports")
    os.makedirs(report_dir, exist_ok=True)
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    sanitized_desc = report_desc.replace(" ", "_").replace("/", "_")
    report_path = os.path.join(report_dir, f"test_run_{timestamp}_{sanitized_desc}.log")
    
    log_file = None
    try:
        log_file = open(report_path, "w", encoding="utf-8")
        log_file.write(f"Command: {cmd}\n")
        log_file.write(f"Date: {datetime.now()}\n")
        log_file.write("-" * 60 + "\n\n")
    except Exception as e:
        print(f"{YELLOW}Warning: Could not open log file: {e}{RESET}")

    try:
        process = subprocess.Popen(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            shell=True,
            cwd=cwd,
            text=True,
            encoding='utf-8',
            errors='replace',
            bufsize=1 # Line buffered
        )
        
        # 实时读取输出
        while True:
            # 检查超时
            if timeout and (time.time() - start_time > timeout):
                process.kill()
                msg = f"\n{RED}❌ Command timed out after {timeout}s{RESET}\n"
                print(msg)
                if log_file: log_file.write(msg)
                return 124

            output = process.stdout.readline()
            if output == '' and process.poll() is not None:
                break
            if output:
                # 写入日志
                if log_file:
                    log_file.write(output)
                    log_file.flush()

                # 简单的高亮逻辑: PASSED变绿, FAILED变红
                line = output.rstrip()
                if "PASSED" in line:
                    print(f"{GREEN}{line}{RESET}")
                elif "FAILED" in line or "ERROR" in line:
                    print(f"{RED}{line}{RESET}")
                else:
                    print(line)
        
        return_code = process.poll()
        if log_file:
            log_file.write(f"\nExit Code: {return_code}\n")
            print(f"\n{CYAN}📄 Log saved to: {report_path}{RESET}")
            
        return return_code
        
    except KeyboardInterrupt:
        msg = f"\n{RED}⚠️ Interrupted by user{RESET}\n"
        print(msg)
        if log_file: log_file.write(msg)
        if 'process' in locals(): process.kill()
        return 130
    except Exception as e:
        msg = f"{RED}Error executing command: {e}{RESET}\n"
        print(msg)
        if log_file: log_file.write(msg)
        return 1
    finally:
        if log_file:
            log_file.close()

def discover_unit_tests(root_dir):
    """自动发现 unit 下的所有一级子目录"""
    unit_path = Path(root_dir) / "tests" / "unit"
    if not unit_path.exists():
        return []
    
    # 排除 __pycache__ 和文件
    dirs = [
        str(p.relative_to(root_dir)).replace("\\", "/") 
        for p in unit_path.iterdir() 
        if p.is_dir() and not p.name.startswith("__")
    ]
    return sorted(dirs)

def run_verification(mode, extra_args):
    base_cmd = "pytest"
    # pytest 基础参数: 详细模式，显示本地变量，此时不做高亮因为流式输出已处理颜色
    pytest_flags = ["-v", "--color=yes"] 
    
    project_root = os.getcwd()
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    
    # 构建测试目标路径
    targets = []
    
    if mode == "quick":
        print_header("⚡ Starting Quick Sanity Check (Auto-Discovery)")
        # 自动发现所有 unit 子模块 + test_*.py 文件
        targets = discover_unit_tests(project_root)
        # 如果没有子文件夹，就跑 tests/unit
        if not targets:
            targets = ["tests/unit"]
            
    elif mode == "unit":
        print_header("🧪 Starting Full Unit Tests")
        targets = ["tests/unit"]
        
    elif mode == "integration":
        print_header("🔗 Starting Integration Tests")
        targets = ["tests/integration"]
        
    elif mode == "edge":
        print_header("🧗 Starting Edge/Stress/Security Tests")
        possible_dirs = ["tests/stress", "tests/performance", "tests/security"]
        targets = [d for d in possible_dirs if os.path.exists(d)]
        if not targets:
            print(f"{YELLOW}No edge test directories found.{RESET}")
            return 0
            
    elif mode == "full":
        print_header("🛡️ Starting Full System Verification (Coverage)")
        targets = ["tests"]
        pytest_flags.extend(["--cov=.", "--cov-report=term-missing"])

    elif mode == "specific":
        # Specific 模式下，target 由 extra_args 提供，或者为空
        if not extra_args:
             print(f"{RED}Error: 'specific' mode requires arguments (e.g. tests/unit/core){RESET}")
             return 1
        targets = [] # extra_args will handle it
    
    else:
        print(f"{RED}Unknown mode: {mode}{RESET}")
        return 1

    # 组合最终命令
    # 结构: pytest [flags] [targets] [extra_args]
    # 注意: extra_args 可能会包含 -k "pattern" 等
    
    cmd_parts = [base_cmd] + pytest_flags + targets + extra_args
    full_cmd = " ".join(cmd_parts)
    
    # 运行
    return_code = run_command_stream(full_cmd, cwd=project_root, timeout=600 if mode == "full" else 300, report_desc=f"Verify_{mode}")
    
    if return_code == 0:
        print_header(f"✅ Verification [{mode}] PASSED")
    else:
        print_header(f"❌ Verification [{mode}] FAILED (Exit Code: {return_code})")
        
    return return_code

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Full System Verification Runner (Evolved)")
    parser.add_argument("mode", choices=["unit", "integration", "edge", "full", "quick", "specific"], 
                        help="Verification mode", default="quick")
    parser.add_argument("extra_args", nargs=argparse.REMAINDER, 
                        help="Pass through arguments to pytest (e.g. tests/unit/core -k test_login)")
    
    args = parser.parse_args()
    
    # 如果 mode 是 specific 且没有提供 extra_args，这在 argparse 层面很难校验，放到 logic 做
    sys.exit(run_verification(args.mode, args.extra_args))
