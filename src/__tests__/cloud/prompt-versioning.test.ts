jest.mock('expo-sqlite', () => ({
  openDatabaseAsync: jest.fn().mockResolvedValue({
    execAsync: jest.fn().mockResolvedValue(undefined),
    getFirstAsync: jest.fn(),
    getAllAsync: jest.fn().mockResolvedValue([]),
    runAsync: jest.fn().mockResolvedValue({ lastInsertRowId: 1, changes: 1 }),
    closeAsync: jest.fn(),
  }),
}));

jest.mock('../../core/database/database', () => ({
  getDatabase: jest.fn().mockResolvedValue({
    execAsync: jest.fn().mockResolvedValue(undefined),
    getFirstAsync: jest.fn(),
    getAllAsync: jest.fn().mockResolvedValue([]),
    runAsync: jest.fn().mockResolvedValue({ lastInsertRowId: 1, changes: 1 }),
    closeAsync: jest.fn(),
  }),
  closeDatabase: jest.fn(),
}));

import {
  savePromptVersion,
  loadActiveVersion,
  loadVersion,
  listVersions,
  rollbackTo,
  getLatestVersionNumber,
} from '../../core/cloud/prompts/prompt-versioning';
import { getAgentSystemPrompt, getAgentSystemPromptSync } from '../../core/cloud/prompts/agent-prompts';
import type { AgentId } from '../../shared/types';

describe('PromptVersionManager', () => {
  const testAgent: AgentId = 'master' as AgentId;
  const testPrompt = 'You are a test agent.';

  it('should save a prompt version', async () => {
    const result = await savePromptVersion({
      agentId: testAgent,
      version: 1,
      prompt: testPrompt,
      changelog: 'Test version',
    });
    expect(result).not.toBeNull();
    expect(result!.agentId).toBe(testAgent);
    expect(result!.version).toBe(1);
  });

  it('should load active version when no version exists returns null', async () => {
    const active = await loadActiveVersion(testAgent);
    expect(active).toBeNull();
  });

  it('should load specific version when no version exists returns null', async () => {
    const loaded = await loadVersion(testAgent, 99);
    expect(loaded).toBeNull();
  });

  it('should return empty list when no versions saved', async () => {
    const versions = await listVersions(testAgent);
    expect(Array.isArray(versions)).toBe(true);
  });

  it('rollback to non-existent version should return false', async () => {
    const result = await rollbackTo(testAgent, 99999);
    expect(result).toBe(false);
  });

  it('getLatestVersionNumber should return 0 when no versions', async () => {
    const version = await getLatestVersionNumber(testAgent);
    expect(typeof version).toBe('number');
    expect(version).toBe(0);
  });
});

describe('AgentPrompts with Versioning', () => {
  it('should return a prompt string (async)', async () => {
    const prompt = await getAgentSystemPrompt('master');
    expect(typeof prompt).toBe('string');
    expect(prompt.length).toBeGreaterThan(50);
  });

  it('should return a prompt string (sync fallback)', () => {
    const prompt = getAgentSystemPromptSync('master');
    expect(typeof prompt).toBe('string');
    expect(prompt.length).toBeGreaterThan(50);
  });

  it('should fallback to master prompt for unknown agent (sync)', () => {
    const prompt = getAgentSystemPromptSync('nonexistent');
    expect(prompt).toBe(getAgentSystemPromptSync('master'));
  });
});
