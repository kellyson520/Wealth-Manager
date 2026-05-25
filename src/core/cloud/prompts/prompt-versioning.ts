import { getDatabase } from '../../database/database';
import { v4 as uuidv4 } from 'uuid';
import { captureError } from '../../logger/logger';
import type { AgentId } from '../../../shared/types';

export interface PromptVersion {
  id: string;
  agentId: AgentId;
  version: number;
  prompt: string;
  changelog: string;
  createdAt: string;
  isActive: boolean;
}

async function ensurePromptVersionsTable(
  db: Awaited<ReturnType<typeof getDatabase>>
): Promise<void> {
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS prompt_versions (
      id TEXT PRIMARY KEY,
      agent_id TEXT NOT NULL,
      version INTEGER NOT NULL,
      prompt TEXT NOT NULL,
      changelog TEXT DEFAULT '',
      created_at TEXT NOT NULL,
      is_active INTEGER DEFAULT 1,
      UNIQUE(agent_id, version)
    );
  `);
  await db.execAsync(
    'CREATE INDEX IF NOT EXISTS idx_prompt_active ON prompt_versions(agent_id, is_active)'
  );
}

export async function savePromptVersion(params: {
  agentId: AgentId;
  version: number;
  prompt: string;
  changelog?: string;
  setActive?: boolean;
}): Promise<PromptVersion | null> {
  try {
    const db = await getDatabase();
    await ensurePromptVersionsTable(db);

    const id = uuidv4();
    const now = new Date().toISOString();

    if (params.setActive !== false) {
      await db.runAsync(
        'UPDATE prompt_versions SET is_active = 0 WHERE agent_id = ? AND is_active = 1',
        [params.agentId]
      );
    }

    const isActive = params.setActive !== false ? 1 : 0;

    await db.runAsync(
      `INSERT OR REPLACE INTO prompt_versions (id, agent_id, version, prompt, changelog, created_at, is_active)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [id, params.agentId, params.version, params.prompt, params.changelog || '', now, isActive]
    );

    return {
      id,
      agentId: params.agentId,
      version: params.version,
      prompt: params.prompt,
      changelog: params.changelog || '',
      createdAt: now,
      isActive: isActive === 1,
    };
  } catch (e) {
    captureError('PromptVersioning.saveVersion', e, 'Failed to save prompt version');
    return null;
  }
}

export async function loadActiveVersion(
  agentId?: AgentId
): Promise<PromptVersion | null> {
  try {
    const db = await getDatabase();
    await ensurePromptVersionsTable(db);

    if (agentId) {
      const row = await db.getFirstAsync<{
        id: string; agent_id: string; version: number; prompt: string;
        changelog: string; created_at: string; is_active: number;
      }>(
        'SELECT * FROM prompt_versions WHERE agent_id = ? AND is_active = 1 ORDER BY version DESC LIMIT 1',
        [agentId]
      );

      if (!row) return null;

      return {
        id: row.id,
        agentId: row.agent_id as AgentId,
        version: row.version,
        prompt: row.prompt,
        changelog: row.changelog,
        createdAt: row.created_at,
        isActive: row.is_active === 1,
      };
    }

    const rows = await db.getAllAsync<{
      id: string; agent_id: string; version: number; prompt: string;
      changelog: string; created_at: string; is_active: number;
    }>(
      'SELECT * FROM prompt_versions WHERE is_active = 1 ORDER BY agent_id ASC'
    );

    return rows.length > 0 ? {
      id: rows[0].id,
      agentId: rows[0].agent_id as AgentId,
      version: rows[0].version,
      prompt: rows[0].prompt,
      changelog: rows[0].changelog,
      createdAt: rows[0].created_at,
      isActive: rows[0].is_active === 1,
    } : null;
  } catch (e) {
    captureError('PromptVersioning.loadActiveVersion', e, 'Failed to load prompt version');
    return null;
  }
}

export async function loadVersion(
  agentId: AgentId,
  version: number
): Promise<PromptVersion | null> {
  try {
    const db = await getDatabase();
    await ensurePromptVersionsTable(db);

    const row = await db.getFirstAsync<{
      id: string; agent_id: string; version: number; prompt: string;
      changelog: string; created_at: string; is_active: number;
    }>(
      'SELECT * FROM prompt_versions WHERE agent_id = ? AND version = ?',
      [agentId, version]
    );

    if (!row) return null;

    return {
      id: row.id,
      agentId: row.agent_id as AgentId,
      version: row.version,
      prompt: row.prompt,
      changelog: row.changelog,
      createdAt: row.created_at,
      isActive: row.is_active === 1,
    };
  } catch (e) {
    captureError('PromptVersioning.loadVersion', e, 'Failed to load specific version');
    return null;
  }
}

export async function listVersions(
  agentId?: AgentId
): Promise<PromptVersion[]> {
  try {
    const db = await getDatabase();
    await ensurePromptVersionsTable(db);

    const where = agentId ? 'WHERE agent_id = ?' : '';
    const params = agentId ? [agentId] : [];

    const rows = await db.getAllAsync<{
      id: string; agent_id: string; version: number; prompt: string;
      changelog: string; created_at: string; is_active: number;
    }>(
      `SELECT * FROM prompt_versions ${where} ORDER BY agent_id ASC, version DESC`,
      params
    );

    return rows.map((r) => ({
      id: r.id,
      agentId: r.agent_id as AgentId,
      version: r.version,
      prompt: r.prompt,
      changelog: r.changelog,
      createdAt: r.created_at,
      isActive: r.is_active === 1,
    }));
  } catch (e) {
    captureError('PromptVersioning.listVersions', e, 'Failed to list versions');
    return [];
  }
}

export async function rollbackTo(
  agentId: AgentId,
  targetVersion: number
): Promise<boolean> {
  try {
    const db = await getDatabase();
    await ensurePromptVersionsTable(db);

    const target = await db.getFirstAsync<{ id: string }>(
      'SELECT id FROM prompt_versions WHERE agent_id = ? AND version = ?',
      [agentId, targetVersion]
    );

    if (!target) return false;

    await db.runAsync(
      'UPDATE prompt_versions SET is_active = 0 WHERE agent_id = ?',
      [agentId]
    );

    await db.runAsync(
      'UPDATE prompt_versions SET is_active = 1 WHERE id = ?',
      [target.id]
    );

    return true;
  } catch (e) {
    captureError('PromptVersioning.rollbackTo', e, 'Failed to rollback prompt version');
    return false;
  }
}

export async function getLatestVersionNumber(agentId: AgentId): Promise<number> {
  try {
    const db = await getDatabase();
    await ensurePromptVersionsTable(db);

    const row = await db.getFirstAsync<{ max_version: number }>(
      'SELECT COALESCE(MAX(version), 0) as max_version FROM prompt_versions WHERE agent_id = ?',
      [agentId]
    );

    return row?.max_version || 0;
  } catch (e) {
    captureError('PromptVersioning.getLatestVersionNumber', e, 'Failed to get latest version');
    return 0;
  }
}

export async function isMigrationNeeded(agentId: AgentId): Promise<boolean> {
  const count = await getLatestVersionNumber(agentId);
  return count === 0;
}
