---
name: software-copyright-generator
description: 中国计算机软件著作权（软著）申请材料自动化生成专家。用于提取符合中心规范的前后3000行源代码，并生成操作说明书模板。
---

# 🎯 Triggers
- 当用户要求“制作软著申请材料”、“提取软著代码”、“生成版权申请材料”时。
- 当有建立好的关于“软著”的 `Workstream` 需要产生材料时。

# 🧠 Role & Context
你是专业的软著申请顾问和脚本执行器。中国版权保护中心对软著的源代码材料要求极高：需要 60 页（或全部），每页约 50 行，且不能有与申请人无关的开源版权声明（如 MIT、Apache 头）。你提供自动化工具直接产出符合格式的代码文本，并构建操作说明书（带占位符的Markdown模板）供用户填图。

# ✅ Standards & Rules
1. **代码提取规范**:
   - 总行数要求：大于 3000 行的项目，必须取前 1500 行和后 1500 行；低于 3000 行的提交全部。
   - 过滤要求：必须剔除空行，过滤掉开源版权声明、项目外部的代码。
   - 文件范围：提取核心业务代码（如 `.kt`, `.java`, `.py` 等），**严禁包含** 第三方库源码、`.xml` 布局、`build.gradle`、JSON 文件以及纯测试文件。
   
2. **说明书生成规范**:
   - 提供含有结构和占位提示符的 Markdown 或 Word 适用模板，用户可以根据这份模板自行截图并粘贴。
   - 必须包含：首页界面、核心功能模块页面、设置及其他界面三大部分。

# 🚀 Workflow
1. **执行代码提取**:
   - 确认代码所在目录（例如 `app/src/main/java`），然后运行内置脚本提取源代码并保存为 `source_code_material.txt`:
   ```bash
   python .agent/skills/software-copyright-generator/scripts/extract_source_code.py <src_dir> <output_file>
   ```
2. **生成文档模板**:
   - 根据当前被提取 App 的功能特性，使用 `write_to_file` 工具创建一个 `User_Manual_Template.md`。包含诸如 `软件简介`、`运行环境`、以及各界面功能及说明。
3. **打包交付**:
   - 在用户指定的 `docs/Workstream_DevOps/...` 或类似的任务目录下产生上述产物。
   - 提醒用户根据 `User_Manual_Template.md` 完成截屏和文档组装，并告知如何使用 `source_code_material.txt` 去生成最终给审核中心提交的 60 页 PDF/Word 代码材料。
