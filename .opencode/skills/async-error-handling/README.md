# Async Error Handling Skill

## 概述

这是一个专门处理 Python 异步编程中异常处理模式的技能，特别关注 `@asynccontextmanager` 装饰器和 FastAPI `lifespan` 事件的正确实现。

## 为什么需要这个技能？

在异步编程中，不正确的异常处理会导致：
- ❌ `RuntimeError: generator didn't stop after athrow()`
- ❌ 资源泄漏（数据库连接、文件句柄等）
- ❌ 应用无法优雅关闭
- ❌ 后台任务无法正确取消

本技能提供：
- ✅ 标准化的异常处理模板
- ✅ 自动化的代码审查工具
- ✅ 快速生成符合最佳实践的代码

## 快速开始

### 1. 生成模板

```bash
# 生成基础异步上下文管理器
python .agent/skills/async-error-handling/scripts/generate_template.py \
    --name my_resource \
    --type basic \
    --output src/my_resource.py

# 生成 FastAPI lifespan
python .agent/skills/async-error-handling/scripts/generate_template.py \
    --name "My API" \
    --type fastapi \
    --output src/main.py

# 生成数据库连接池管理器
python .agent/skills/async-error-handling/scripts/generate_template.py \
    --name database \
    --type database \
    --output src/db.py
```

### 2. 检查现有代码

```bash
# 检查整个项目
python .agent/skills/async-error-handling/scripts/check_async_patterns.py

# 检查特定目录
python .agent/skills/async-error-handling/scripts/check_async_patterns.py --path src/

# 检查单个文件
python .agent/skills/async-error-handling/scripts/check_async_patterns.py --path src/main.py
```

## 核心原则

### ✅ 正确模式

```python
@asynccontextmanager
async def resource_manager():
    resource = await init()
    cancelled = False  # 👈 标志位
    
    try:
        yield resource
    except asyncio.CancelledError:
        cancelled = True  # 👈 只标记，不重抛
    finally:
        await cleanup(resource)
        if cancelled:
            raise asyncio.CancelledError()  # 👈 清理后重抛
```

### ❌ 错误模式

```python
@asynccontextmanager
async def bad_manager():
    resource = await init()
    
    try:
        yield resource
    except asyncio.CancelledError:
        pass  # ❌ 吞掉异常
    finally:
        await cleanup(resource)
    # ❌ 没有重抛 CancelledError
```

## 工具说明

### `check_async_patterns.py`

静态代码分析工具，使用 AST 检测：
- 缺少 `finally` 块
- 缺少 `CancelledError` 处理
- 在 `except` 块中直接 `raise`
- 缺少条件性重抛逻辑

### `generate_template.py`

代码生成器，支持以下模板：
- `basic`: 通用异步上下文管理器
- `fastapi`: FastAPI lifespan 事件处理
- `database`: 数据库连接池管理
- `background_tasks`: 后台任务管理

## 参考资料

- [SKILL.md](./SKILL.md) - 完整的技能文档
- [PEP 492](https://peps.python.org/pep-0492/) - Python 异步语法规范
- [FastAPI Lifespan](https://fastapi.tiangolo.com/advanced/events/) - FastAPI 官方文档

## 实战案例

本技能源于真实的生产问题修复：
- **问题**: FastAPI 应用关闭时出现 `RuntimeError: generator didn't stop after athrow()`
- **原因**: `lifespan` 上下文管理器吞掉了 `CancelledError`
- **解决**: 使用标志位模式，在 `finally` 后重抛
- **文档**: [20260115_Fix_FastAPI_Lifespan_Error](../../docs/Workstream_Core_Engineering/20260115_Fix_FastAPI_Lifespan_Error/)

## 贡献

如果你发现新的异步异常处理反模式，欢迎：
1. 更新 `check_async_patterns.py` 添加检测规则
2. 在 `SKILL.md` 中添加到 "Common Pitfalls" 章节
3. 提供新的模板到 `generate_template.py`
