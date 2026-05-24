
import os
import sys
import shutil

def smart_repair(file_path):
    """
    智能修复源代码中的乱码和常见语法错误。
    主要针对：
    1. 错误的中文乱码 (Mojibake)
    2. 因乱码导致的字符串未闭合 (Unterminated String)
    3. 常见的中文截断 (Truncated Chinese Phrases)
    4. 常见的缩进混乱 (Indentation Chaos - 简单修复)
    """
    if not os.path.exists(file_path):
        print(f"[ERROR] File not found: {file_path}")
        return False

    print(f"Processing: {file_path}")
    
    # 1. 备份
    backup_path = file_path + ".bak"
    if not os.path.exists(backup_path):
        shutil.copy2(file_path, backup_path)
        print(f"  Backup created: {backup_path}")

    try:
        # 尝试读取，容忍错误
        with open(file_path, 'r', encoding='utf-8', errors='replace') as f:
            lines = f.readlines()
    except Exception as e:
        print(f"  [ERROR] Failed to read file: {e}")
        return False

    new_lines = []
    changes_count = 0

    # 常见乱码字典 (Dictionary Mapping)
    # 这里的乱码是由于 GBK 被错误地当成 ISO-8859-1 解码导致的典型特征
    mojibake_map = {
        '娣诲姞': '添加', '配置': '配置', '目录': '目录', '文件': '文件', 
        '不存': '不存在', '信': '信息', '权': '权限', '问': '访问',
        '数': '数据', '据': '数据', '库': '库', '表': '表',
        '关': '关闭', '开': '开启', '启': '启用', '停': '停止',
        '成': '成功', '失': '失败', '败': '失败', '误': '错误',
        '常': '异常', '例': '例外', '外': '例外', '处': '处理',
        '理': '处理', '接': '接口', '口': '接口', '连': '连接',
        '接': '连接', '请': '请求', '求': '请求', '响': '响应',
        '应': '响应', '回': '返回', '返': '返回', '用': '用户',
        '户': '用户', '名': '名', '密': '密码', '码': '密码',
        '登': '登录', '录': '登录', '注': '注册', '册': '注册',
        '删': '删除', '除': '删除', '改': '修改', '查': '查询',
        '询': '查询', '找': '找到', '到': '找到', '未': '未找到',
        '空': '空', '无': '无', '有': '有', '是': '是',
        '否': '否', '真': '真', '假': '假', '实': '实例',
        '例': '实例', '对象': '对象', '类': '类', '函数': '函数',
        '法': '方法', '参': '参数', '数': '参数', '变': '变量',
        '量': '变量', '属': '属性', '性': '属性', '值': '值',
        '键': '键', '列': '列表', '表': '表', '字': '字典',
        '典': '字典', '元': '元组', '组': '元组', '集': '集合',
        '合': '集合', '字': '字符串', '符': '符', '串': '串',
        '整': '整数', '浮': '浮点数', '布': '布尔值', '尔': '尔',
    }
    
    # 截断修复字典 (Truncation Repair)
    truncation_map = {
        '目录不存"': '目录不存在"',
        '文件不存"': '文件不存在"',
        '无法获取属"': '无法获取属性"',
        '无法获取"': '无法获取"',
        '返回测试数"': '返回测试数据"',
        '返回测试据"': '返回测试数据"',
        '上下文信"': '上下文信息"',
        '上下文"': '上下文"',
        '会话被关"': '会话被关闭"',
        '会话"': '会话"',
        '验证访问权"': '验证访问权限"',
        '访问权"': '访问权限"',
        '外部网络的访"': '外部网络的访问"',
        '媒体文"': '媒体文件"',
        '媒体"': '媒体"',
        '一并删"': '一并删除"',
        '已删除条"': '已删除条目"',
        '条目录"': '条目"',
        '条目"': '条目"',
        '规则对应的条"': '规则对应的条目"',
        '最大限"': '最大限额"',
        '需要删"': '需要删除"',
        '过期条目时出"': '过期条目时出错"',
        '出"': '出错"',
        '新消"': '新消息"',
        '消息"': '消息"',
        '恢复原标"': '恢复原标题"',
        '标题"': '标题"',
        '强制删除目"': '强制删除目录"',
        '规则数据时出"': '规则数据时出错"',
    }

    for line in lines:
        original_line = line
        fixed_line = line

        # 1. 移除 U+FFFD (Replacement Character)
        if '\ufffd' in fixed_line:
            fixed_line = fixed_line.replace('\ufffd', '')

        # 2. 尝试基于 Mojibake 标记的逆向修复 (Smart Reverse)
        # 如果行包含特定的“乱码特征字符”，尝试 GB18030 -> UTF-8 逆向
        # 注意：这步比较激进，只对特定字符组合尝试
        # 2. 尝试基于 Mojibake 标记的逆向修复 (Smart Reverse)
        # 如果行包含特定的“乱码特征字符”，尝试 GB18030 -> UTF-8 逆向
        # Common artifact: "鍘" (part of History), "锘" (BOM), "锟" (Replacement)
        if any(c in fixed_line for c in ["鍘", "锟", "氓", "锛", "辎", "锘"]): 
             try:
                 # Logic: The current str is what you get when you read UTF-8 bytes as GBK.
                 # To fix: Encode back to bytes using GBK (gb18030 covers more), then decode as UTF-8.
                 recovered = fixed_line.encode('gb18030').decode('utf-8')
                 # Simple heuristic: If it worked and changed significantly, accept it.
                 fixed_line = recovered
             except Exception:
                 # If conversion fails (e.g. bytes aren't valid UTF-8), keep original
                 pass


        # 3. 字典替换 (Dictionary Replacement)
        # 针对已知的截断和乱码
        for broken, fixed in truncation_map.items():
            if broken in fixed_line:
                fixed_line = fixed_line.replace(broken, fixed)
        
        # 4. 语法修复：未闭合的 f-string (Unterminated String)
        # 检测模式: f".... (无结束引号)
        # 或者是: logger.info(f".... )
        if 'f"' in fixed_line and fixed_line.count('"') % 2 != 0:
            # 尝试在行尾或括号前添加引号
            stripped = fixed_line.rstrip()
            if stripped.endswith(')'):
                fixed_line = stripped[:-1] + '")\n'
            else:
                fixed_line = stripped + '"\n'

        # 5. 语法修复：无效字符 (Invalid Characters)
        # 移除不可见字符，保留基本的控制字符 (tab, newline)
        # fixed_line = re.sub(r'[^\x09\x0A\x0D\x20-\x7E\x80-\xFF]', '', fixed_line) # Too aggressive
        
        if fixed_line != original_line:
            changes_count += 1
            new_lines.append(fixed_line)
        else:
            new_lines.append(line)

    if changes_count > 0:
        print(f"  Fixed {changes_count} lines.")
        try:
            with open(file_path, 'w', encoding='utf-8') as f:
                f.writelines(new_lines)
            print("  [SUCCESS] File saved.")
            return True
        except Exception as e:
            print(f"  [ERROR] Failed to save file: {e}")
            return False
    else:
        print("  [INFO] No changes needed.")
        return True

def main():
    if len(sys.argv) < 2:
        print("Usage: python smart_repair.py <file_path> [file_path2 ...]")
        return
    
    for path in sys.argv[1:]:
        smart_repair(path)

if __name__ == "__main__":
    main()
