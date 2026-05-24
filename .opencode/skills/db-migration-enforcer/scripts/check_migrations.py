import os
import sys
import logging
from sqlalchemy import inspect

# 设置日志
logging.basicConfig(level=logging.INFO, format='%(levelname)s: %(message)s')
logger = logging.getLogger("migration-enforcer")

def check_migrations():
    # 1. 设置路径，导入模型
    sys.path.append(os.getcwd())
    try:
        from models.models import Base, get_engine
    except ImportError as e:
        logger.error(f"无法导入模型: {e}")
        return

    # 2. 获取数据库引擎
    engine = get_engine()
    inspector = inspect(engine)
    
    # 3. 遍历模型定义
    discrepancies = []
    
    # Base.metadata.tables 包含了所有定义的表
    for table_name, table_obj in Base.metadata.tables.items():
        # 检查表是否存在
        if not inspector.has_table(table_name):
            discrepancies.append({
                "table": table_name,
                "type": "MISSING_TABLE",
                "message": f"表 {table_name} 在数据库中不存在"
            })
            continue
        
        # 获取数据库中的列
        db_columns = {col['name']: col for col in inspector.get_columns(table_name)}
        
        # 获取模型定义的列
        for column in table_obj.columns:
            if column.name not in db_columns:
                discrepancies.append({
                    "table": table_name,
                    "column": column.name,
                    "type": "MISSING_COLUMN",
                    "sql": f"ALTER TABLE {table_name} ADD COLUMN {column.name} {column.type} {'DEFAULT ' + str(column.default.arg) if column.default else ''}",
                    "message": f"列 {table_name}.{column.name} 在数据库中缺失"
                })

    # 4. 输出报告
    if not discrepancies:
        logger.info("✅ 数据库架构与 SQLAlchemy 模型 100% 同步。")
    else:
        logger.warning(f"❌ 发现 {len(discrepancies)} 处架构不一致:")
        for d in discrepancies:
            if d['type'] == 'MISSING_TABLE':
                print(f"  [MISSING TABLE] {d['table']}")
            else:
                print(f"  [MISSING COLUMN] {d['table']}.{d['column']}")
                print(f"    Suggested DDL: {d['sql']}")
        
        print("\n💡 建议方案:")
        print("1. 更新 models/models.py 中的 migrate_db 函数。")
        print("2. 在对应的表列映射中添加缺少的 ALTER TABLE 语句。")
        print("3. 运行 python models/models.py 触发迁移。")

if __name__ == "__main__":
    check_migrations()
