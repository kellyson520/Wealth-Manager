#!/usr/bin/env python3
"""
异步上下文管理器模板生成器
Async Context Manager Template Generator

用途：生成符合最佳实践的异步上下文管理器代码模板
Usage: python generate_template.py --name <resource_name> [--type <template_type>]
"""

import argparse
from pathlib import Path


TEMPLATES = {
    "basic": """from contextlib import asynccontextmanager
import asyncio
import logging

logger = logging.getLogger(__name__)


@asynccontextmanager
async def {name}_manager():
    \"\"\"
    {description}
    
    使用示例:
        async with {name}_manager() as resource:
            await resource.do_something()
    \"\"\"
    # 1. 初始化资源
    logger.info("Initializing {name}")
    resource = await initialize_{name}()
    
    # 2. 标志位：追踪取消状态
    cancelled = False
    
    try:
        # 3. 将资源交给调用者
        yield resource
        
    except asyncio.CancelledError:
        # 4. 捕获取消信号
        logger.warning("{name} usage cancelled")
        cancelled = True
        
    except Exception as e:
        # 5. 处理其他异常
        logger.error(f"Error in {name}: {{e}}", exc_info=True)
        raise
        
    finally:
        # 6. 清理资源
        logger.info("Cleaning up {name}")
        await cleanup_{name}(resource)
        
        # 7. 重新抛出取消异常
        if cancelled:
            raise asyncio.CancelledError()


async def initialize_{name}():
    \"\"\"初始化 {name} 资源\"\"\"
    # TODO: 实现初始化逻辑
    return {{"status": "initialized"}}


async def cleanup_{name}(resource):
    \"\"\"清理 {name} 资源\"\"\"
    # TODO: 实现清理逻辑
    pass
""",

    "fastapi": """from contextlib import asynccontextmanager
from fastapi import FastAPI
import asyncio
import logging

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    \"\"\"
    FastAPI 应用生命周期管理
    
    负责:
    - 启动时初始化资源 (数据库、缓存、后台任务等)
    - 关闭时清理资源
    - 正确处理取消信号
    \"\"\"
    # === Startup ===
    logger.info("🚀 Application starting up")
    
    try:
        # TODO: 添加初始化逻辑
        # await init_database()
        # await init_cache()
        # background_tasks = await start_workers()
        
        logger.info("✅ Application startup complete")
        
    except Exception as e:
        logger.error(f"❌ Startup failed: {{e}}", exc_info=True)
        raise
    
    # 标志位：追踪取消状态
    cancelled = False
    
    try:
        # === Running ===
        yield
        
    except asyncio.CancelledError:
        logger.warning("⚠️ Application shutdown requested")
        cancelled = True
        
    except Exception as e:
        logger.error(f"❌ Runtime error: {{e}}", exc_info=True)
        raise
        
    finally:
        # === Shutdown ===
        logger.info("🛑 Application shutting down")
        
        try:
            # TODO: 添加清理逻辑
            # await stop_workers(background_tasks)
            # await close_cache()
            # await close_database()
            
            logger.info("✅ Application shutdown complete")
            
        except Exception as e:
            logger.error(f"⚠️ Error during shutdown: {{e}}", exc_info=True)
        
        # 重新抛出取消异常
        if cancelled:
            raise asyncio.CancelledError()


# 创建应用
app = FastAPI(
    title="{title}",
    lifespan=lifespan
)
""",

    "database": """from contextlib import asynccontextmanager
import asyncio
import logging
import asyncpg  # 或其他数据库驱动

logger = logging.getLogger(__name__)


@asynccontextmanager
async def database_pool(dsn: str, min_size: int = 5, max_size: int = 20):
    \"\"\"
    数据库连接池生命周期管理
    
    Args:
        dsn: 数据库连接字符串
        min_size: 最小连接数
        max_size: 最大连接数
    
    使用示例:
        async with database_pool(settings.DATABASE_URL) as pool:
            async with pool.acquire() as conn:
                result = await conn.fetch("SELECT * FROM users")
    \"\"\"
    # 创建连接池
    logger.info(f"📊 Creating database pool (min={{min_size}}, max={{max_size}})")
    pool = await asyncpg.create_pool(
        dsn=dsn,
        min_size=min_size,
        max_size=max_size
    )
    logger.info(f"✅ Database pool created: {{pool.get_size()}} connections")
    
    cancelled = False
    
    try:
        yield pool
        
    except asyncio.CancelledError:
        logger.warning("⚠️ Database pool usage cancelled")
        cancelled = True
        
    except Exception as e:
        logger.error(f"❌ Database pool error: {{e}}", exc_info=True)
        raise
        
    finally:
        logger.info("🛑 Closing database pool")
        await pool.close()
        logger.info("✅ Database pool closed")
        
        if cancelled:
            raise asyncio.CancelledError()
""",

    "background_tasks": """from contextlib import asynccontextmanager
import asyncio
import logging
from typing import List

logger = logging.getLogger(__name__)


@asynccontextmanager
async def background_task_manager():
    \"\"\"
    后台任务生命周期管理
    
    使用示例:
        async with background_task_manager() as tasks:
            # 任务已启动，应用运行中
            await asyncio.sleep(10)
        # 退出时自动取消并等待所有任务
    \"\"\"
    tasks: List[asyncio.Task] = []
    
    # 启动后台任务
    logger.info("🔄 Starting background tasks")
    
    # TODO: 添加你的后台任务
    # tasks.append(asyncio.create_task(periodic_cleanup()))
    # tasks.append(asyncio.create_task(metrics_collector()))
    # tasks.append(asyncio.create_task(health_checker()))
    
    logger.info(f"✅ Started {{len(tasks)}} background tasks")
    
    cancelled = False
    
    try:
        yield tasks
        
    except asyncio.CancelledError:
        logger.warning("⚠️ Background tasks cancelled")
        cancelled = True
        
    except Exception as e:
        logger.error(f"❌ Background task error: {{e}}", exc_info=True)
        raise
        
    finally:
        logger.info("🛑 Stopping background tasks")
        
        # 取消所有未完成的任务
        for task in tasks:
            if not task.done():
                task.cancel()
        
        # 等待所有任务完成（包括取消）
        results = await asyncio.gather(*tasks, return_exceptions=True)
        
        # 记录任务结果
        for i, result in enumerate(results):
            if isinstance(result, asyncio.CancelledError):
                logger.debug(f"Task {{i}} was cancelled")
            elif isinstance(result, Exception):
                logger.error(f"Task {{i}} failed: {{result}}")
        
        logger.info("✅ All background tasks stopped")
        
        if cancelled:
            raise asyncio.CancelledError()
"""
}


def generate_template(name: str, template_type: str, output_path: Path = None):
    """生成模板代码"""
    template = TEMPLATES.get(template_type)
    
    if not template:
        print(f"❌ 未知的模板类型: {template_type}")
        print(f"可用类型: {', '.join(TEMPLATES.keys())}")
        return
    
    # 格式化模板
    code = template.format(
        name=name,
        description=f"{name} 资源管理器",
        title=name.replace('_', ' ').title()
    )
    
    # 输出
    if output_path:
        output_path.parent.mkdir(parents=True, exist_ok=True)
        with open(output_path, 'w', encoding='utf-8') as f:
            f.write(code)
        print(f"✅ 模板已生成: {output_path}")
    else:
        print(code)


def main():
    parser = argparse.ArgumentParser(
        description="生成异步上下文管理器模板"
    )
    parser.add_argument(
        '--name',
        type=str,
        required=True,
        help='资源名称 (如: database, cache, worker)'
    )
    parser.add_argument(
        '--type',
        type=str,
        default='basic',
        choices=list(TEMPLATES.keys()),
        help=f'模板类型 (可选: {", ".join(TEMPLATES.keys())})'
    )
    parser.add_argument(
        '--output',
        type=str,
        help='输出文件路径 (不指定则打印到标准输出)'
    )
    
    args = parser.parse_args()
    
    output_path = Path(args.output) if args.output else None
    generate_template(args.name, args.type, output_path)


if __name__ == "__main__":
    main()
