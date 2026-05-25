import type { ToolEntry } from '../../agents/_shared/tool-registry';

interface OpenAIFunctionDefinition {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, {
      type: string;
      description: string;
      enum?: string[];
    }>;
    required: string[];
  };
}

export function toolsToOpenAIFunctions(tools: ToolEntry[]): OpenAIFunctionDefinition[] {
  return tools.map((tool) => {
    const { definition } = tool;
    const properties: Record<string, { type: string; description: string; enum?: string[] }> = {};
    const required: string[] = [];

    for (const param of definition.parameters) {
      const jsonType = param.type === 'array' ? 'array' : param.type === 'object' ? 'object' : param.type === 'number' ? 'number' : param.type === 'boolean' ? 'boolean' : 'string';
      properties[param.name] = {
        type: jsonType,
        description: param.description,
      };
      if (param.required) {
        required.push(param.name);
      }
    }

    return {
      name: definition.name,
      description: `${definition.description} [权限L${definition.permissionLevel}, 超时${definition.timeout}ms]`,
      parameters: {
        type: 'object',
        properties,
        required,
      },
    };
  });
}

export function buildSystemPrompt(agentName: string, tools: ToolEntry[]): string {
  let prompt = `你是 Wealth Manager 的 ${agentName} Agent，一个AI原生对话式记账系统的智能子模块。

## 核心原则
1. 所有数据操作必须通过调用工具（function calling）完成，不要虚构数据
2. 优先使用本地工具，只在必要时请求云端能力
3. 金额单位统一为人民币元（¥），精确到小数点后两位
4. 分类体系：餐饮、交通、购物、住房、娱乐、医疗、教育、水电、其他
5. 回复使用简洁友好的中文，必要时使用emoji增强可读性

## 可用工具
`;

  for (const tool of tools) {
    const d = tool.definition;
    prompt += `- **${d.name}**: ${d.description} (权限L${d.permissionLevel})\n`;
    for (const param of d.parameters) {
      prompt += `  - ${param.name} (${param.type}${param.required ? ', 必填' : ', 可选'}): ${param.description}\n`;
    }
    prompt += '\n';
  }

  prompt += `
## 输出格式
当需要执行操作时，必须调用对应的工具函数。每次只调用一个工具，等待结果后再决定下一步。
对于不需要工具的问题，直接用中文回复。
当多个工具都需要调用时，按逻辑顺序逐个调用。
`;

  return prompt;
}

export function buildToolCallPrompt(toolName: string, params: Record<string, unknown>): string {
  const paramStr = Object.entries(params)
    .map(([k, v]) => `${k}=${JSON.stringify(v)}`)
    .join(', ');
  return `调用工具: ${toolName}(${paramStr})`;
}

export function parseFunctionCallArgs(
  functionName: string,
  rawArgs: string
): Record<string, unknown> {
  try {
    return JSON.parse(rawArgs);
  } catch {
    return {};
  }
}
