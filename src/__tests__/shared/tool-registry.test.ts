import {
  registerTool,
  getTool,
  listToolsForAgent,
  isToolAllowedForAgent,
  getAllTools,
  getToolNamesForAgent,
  describeToolsForAgent,
} from '../../agents/_shared/tool-registry';
import { ToolEntry } from '../../agents/_shared';
import { AgentId } from '../../shared/types';

function createMockTool(name: string, permissionLevel: 0 | 1 | 2, allowedAgents: AgentId[]): ToolEntry {
  return {
    definition: {
      name,
      description: `${name} tool`,
      permissionLevel,
      parameters: [
        { name: 'param1', type: 'string', required: true, description: 'A parameter' },
      ],
      returns: { type: 'object', description: 'Result' },
      timeout: 5000,
      retryable: false,
      idempotent: true,
    },
    handler: async () => ({ success: true }),
    allowedAgents,
  };
}

describe('Tool Registry', () => {
  beforeEach(() => {
    const registry = getAllTools();
    registry.clear();
  });

  describe('registerTool', () => {
    test('registers a tool successfully', () => {
      const tool = createMockTool('add_bill', 1, ['ledger', 'master']);
      registerTool(tool);
      const retrieved = getTool('add_bill');
      expect(retrieved).toBeDefined();
      expect(retrieved?.definition.name).toBe('add_bill');
    });

    test('overwrites tool with same name', () => {
      const tool1 = createMockTool('add_bill', 1, ['ledger']);
      const tool2 = createMockTool('add_bill', 2, ['guardian']);
      registerTool(tool1);
      registerTool(tool2);
      const retrieved = getTool('add_bill');
      expect(retrieved?.definition.permissionLevel).toBe(2);
    });
  });

  describe('getTool', () => {
    test('returns undefined for unregistered tool', () => {
      expect(getTool('nonexistent')).toBeUndefined();
    });

    test('returns correct tool after registration', () => {
      const tool = createMockTool('search_bills', 0, ['ledger', 'analyst']);
      registerTool(tool);
      const retrieved = getTool('search_bills');
      expect(retrieved?.definition.name).toBe('search_bills');
      expect(retrieved?.definition.permissionLevel).toBe(0);
    });
  });

  describe('listToolsForAgent', () => {
    test('returns only tools allowed for the agent', () => {
      registerTool(createMockTool('add_bill', 1, ['ledger']));
      registerTool(createMockTool('search_bills', 0, ['ledger', 'analyst']));
      registerTool(createMockTool('run_safety_check', 0, ['guardian']));

      const ledgerTools = listToolsForAgent('ledger');
      expect(ledgerTools.length).toBe(2);
      expect(ledgerTools.map(t => t.definition.name)).toContain('add_bill');
      expect(ledgerTools.map(t => t.definition.name)).toContain('search_bills');
    });

    test('returns empty array for agent with no tools', () => {
      const tools = listToolsForAgent('coach');
      expect(tools).toEqual([]);
    });
  });

  describe('isToolAllowedForAgent', () => {
    test('returns true for allowed agent', () => {
      registerTool(createMockTool('add_bill', 1, ['ledger']));
      expect(isToolAllowedForAgent('add_bill', 'ledger')).toBe(true);
    });

    test('returns false for disallowed agent', () => {
      registerTool(createMockTool('add_bill', 1, ['ledger']));
      expect(isToolAllowedForAgent('add_bill', 'guardian')).toBe(false);
    });

    test('returns false for unregistered tool', () => {
      expect(isToolAllowedForAgent('nonexistent', 'ledger')).toBe(false);
    });
  });

  describe('getToolNamesForAgent', () => {
    test('returns tool names as strings', () => {
      registerTool(createMockTool('add_bill', 1, ['ledger']));
      registerTool(createMockTool('search_bills', 0, ['ledger']));
      const names = getToolNamesForAgent('ledger');
      expect(names).toEqual(['add_bill', 'search_bills']);
    });
  });

  describe('describeToolsForAgent', () => {
    test('returns description string', () => {
      registerTool(createMockTool('add_bill', 1, ['ledger']));
      const description = describeToolsForAgent('ledger');
      expect(description).toContain('add_bill');
      expect(description).toContain('L1');
    });

    test('returns fallback for agent with no tools', () => {
      expect(describeToolsForAgent('coach')).toContain('无直接工具');
    });
  });

  describe('edge cases', () => {
    test('multiple registrations with different agents', () => {
      registerTool(createMockTool('add_bill', 1, ['ledger']));
      registerTool(createMockTool('add_bill', 1, ['ledger', 'master']));
      const tool = getTool('add_bill');
      expect(tool?.allowedAgents).toContain('master');
      expect(tool?.allowedAgents).toContain('ledger');
    });
  });
});
