#!/usr/bin/env python3
"""
异步上下文管理器代码审查工具
Async Context Manager Code Review Tool

用途：扫描项目中的异步上下文管理器，检测常见的异常处理错误
Usage: python check_async_patterns.py [--path <directory>]
"""

import ast
import sys
from pathlib import Path
from typing import List, Tuple
import argparse


class AsyncContextManagerChecker(ast.NodeVisitor):
    """AST 访问器，检查异步上下文管理器的异常处理模式"""
    
    def __init__(self, filepath: str):
        self.filepath = filepath
        self.issues: List[Tuple[int, str, str]] = []  # (line, severity, message)
        self.current_function = None
        self.in_asynccontextmanager = False
        
    def visit_FunctionDef(self, node: ast.FunctionDef):
        """访问函数定义"""
        # 检查是否是异步函数
        if isinstance(node, ast.AsyncFunctionDef):
            # 检查是否有 @asynccontextmanager 装饰器
            for decorator in node.decorator_list:
                if isinstance(decorator, ast.Name) and decorator.id == 'asynccontextmanager':
                    self.in_asynccontextmanager = True
                    self.current_function = node.name
                    self._check_async_context_manager(node)
                    break
        
        self.generic_visit(node)
        self.in_asynccontextmanager = False
        self.current_function = None
    
    def _check_async_context_manager(self, node: ast.AsyncFunctionDef):
        """检查异步上下文管理器的实现"""
        # 查找 try-except-finally 结构
        try_nodes = [n for n in ast.walk(node) if isinstance(n, ast.Try)]
        
        if not try_nodes:
            self.issues.append((
                node.lineno,
                "WARNING",
                f"函数 '{node.name}' 使用了 @asynccontextmanager 但没有 try-except-finally 结构"
            ))
            return
        
        for try_node in try_nodes:
            # 检查是否有 yield
            has_yield = any(isinstance(n, ast.Expr) and isinstance(n.value, ast.Yield) 
                          for n in ast.walk(try_node))
            
            if not has_yield:
                continue
            
            # 检查异常处理
            self._check_exception_handlers(try_node, node.name)
            
            # 检查 finally 块
            self._check_finally_block(try_node, node.name)
    
    def _check_exception_handlers(self, try_node: ast.Try, func_name: str):
        """检查异常处理器"""
        has_cancelled_error_handler = False
        cancelled_error_reraises = False
        
        for handler in try_node.handlers:
            # 检查是否捕获了 CancelledError
            if handler.type:
                if isinstance(handler.type, ast.Attribute):
                    if (handler.type.attr == 'CancelledError' and 
                        isinstance(handler.type.value, ast.Name) and 
                        handler.type.value.id == 'asyncio'):
                        has_cancelled_error_handler = True
                        
                        # 检查是否重抛
                        for stmt in handler.body:
                            if isinstance(stmt, ast.Raise):
                                if stmt.exc is None or (
                                    isinstance(stmt.exc, ast.Call) and
                                    isinstance(stmt.exc.func, ast.Attribute) and
                                    stmt.exc.func.attr == 'CancelledError'
                                ):
                                    cancelled_error_reraises = True
                        
                        # 如果在 except 块中直接 raise，这是错误的
                        if cancelled_error_reraises:
                            self.issues.append((
                                handler.lineno,
                                "ERROR",
                                f"函数 '{func_name}' 在 except CancelledError 块中直接 raise，"
                                f"应该使用标志位并在 finally 后重抛"
                            ))
        
        if not has_cancelled_error_handler:
            self.issues.append((
                try_node.lineno,
                "WARNING",
                f"函数 '{func_name}' 没有显式处理 asyncio.CancelledError"
            ))
    
    def _check_finally_block(self, try_node: ast.Try, func_name: str):
        """检查 finally 块"""
        if not try_node.finalbody:
            self.issues.append((
                try_node.lineno,
                "ERROR",
                f"函数 '{func_name}' 缺少 finally 块，资源可能无法正确清理"
            ))
            return
        
        # 检查 finally 块中是否有条件性的 raise CancelledError
        has_conditional_raise = False
        for stmt in ast.walk(try_node.finalbody[0] if try_node.finalbody else None):
            if isinstance(stmt, ast.If):
                for body_stmt in stmt.body:
                    if isinstance(body_stmt, ast.Raise):
                        if (isinstance(body_stmt.exc, ast.Call) and
                            isinstance(body_stmt.exc.func, ast.Attribute) and
                            body_stmt.exc.func.attr == 'CancelledError'):
                            has_conditional_raise = True
        
        if not has_conditional_raise:
            self.issues.append((
                try_node.finalbody[0].lineno if try_node.finalbody else try_node.lineno,
                "WARNING",
                f"函数 '{func_name}' 的 finally 块可能缺少条件性重抛 CancelledError 的逻辑"
            ))


def check_file(filepath: Path) -> List[Tuple[int, str, str]]:
    """检查单个文件"""
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            source = f.read()
        
        tree = ast.parse(source, filename=str(filepath))
        checker = AsyncContextManagerChecker(str(filepath))
        checker.visit(tree)
        return checker.issues
    
    except SyntaxError as e:
        return [(e.lineno or 0, "ERROR", f"语法错误: {e.msg}")]
    except Exception as e:
        return [(0, "ERROR", f"无法解析文件: {e}")]


def check_directory(directory: Path) -> dict:
    """检查目录中的所有 Python 文件"""
    results = {}
    
    for py_file in directory.rglob("*.py"):
        # 跳过虚拟环境和缓存目录
        if any(part.startswith('.') or part in ['venv', '__pycache__', 'node_modules'] 
               for part in py_file.parts):
            continue
        
        issues = check_file(py_file)
        if issues:
            results[str(py_file)] = issues
    
    return results


def print_results(results: dict):
    """打印检查结果"""
    if not results:
        print("✅ 未发现异步上下文管理器异常处理问题")
        return
    
    print(f"\n🔍 发现 {len(results)} 个文件存在潜在问题:\n")
    
    total_errors = 0
    total_warnings = 0
    
    for filepath, issues in results.items():
        print(f"📄 {filepath}")
        for line, severity, message in issues:
            icon = "❌" if severity == "ERROR" else "⚠️"
            print(f"  {icon} Line {line}: [{severity}] {message}")
            
            if severity == "ERROR":
                total_errors += 1
            else:
                total_warnings += 1
        print()
    
    print(f"📊 总计: {total_errors} 个错误, {total_warnings} 个警告")
    
    if total_errors > 0:
        print("\n💡 建议: 查看 .agent/skills/async-error-handling/SKILL.md 了解正确的实现模式")


def main():
    parser = argparse.ArgumentParser(
        description="检查异步上下文管理器的异常处理模式"
    )
    parser.add_argument(
        '--path',
        type=str,
        default='.',
        help='要检查的目录路径 (默认: 当前目录)'
    )
    
    args = parser.parse_args()
    path = Path(args.path)
    
    if not path.exists():
        print(f"❌ 路径不存在: {path}")
        sys.exit(1)
    
    print(f"🔍 正在扫描: {path.absolute()}\n")
    
    if path.is_file():
        issues = check_file(path)
        results = {str(path): issues} if issues else {}
    else:
        results = check_directory(path)
    
    print_results(results)
    
    # 如果有错误，返回非零退出码
    has_errors = any(
        any(severity == "ERROR" for _, severity, _ in issues)
        for issues in results.values()
    )
    
    sys.exit(1 if has_errors else 0)


if __name__ == "__main__":
    main()
