import { getDatabase } from '../../core/database/database';
import { captureError, logger } from '../../core/logger/logger';
import { encryptPayload, decryptPayload } from '../../core/cloud/sync-crypto';
import type { ToolResult } from '../../shared/types';

interface WebDAVConfig {
  url: string;
  username: string;
  password: string;
  enabled: boolean;
  lastSyncAt?: string;
  lastSyncStatus?: 'success' | 'error' | 'conflict';
}

async function getConfig(db: Awaited<ReturnType<typeof getDatabase>>): Promise<WebDAVConfig | null> {
  try {
    const row = await db.getFirstAsync<{ value: string }>(
      "SELECT value FROM sync_state WHERE key = 'webdav_config'"
    );
    if (!row) return null;
    return JSON.parse(row.value) as WebDAVConfig;
  } catch {
    return null;
  }
}

async function saveConfig(
  db: Awaited<ReturnType<typeof getDatabase>>,
  config: WebDAVConfig
): Promise<void> {
  const now = new Date().toISOString();
  await db.runAsync(
    "INSERT OR REPLACE INTO sync_state (key, value, updated_at) VALUES ('webdav_config', ?, ?)",
    [JSON.stringify(config), now]
  );
}

async function updateLastSync(
  db: Awaited<ReturnType<typeof getDatabase>>,
  status: 'success' | 'error' | 'conflict'
): Promise<void> {
  const now = new Date().toISOString();
  await db.runAsync(
    "INSERT OR REPLACE INTO sync_state (key, value, updated_at) VALUES (?, ?, ?)",
    ['last_sync', JSON.stringify({ timestamp: now, status }), now]
  );
}

function base64Encode(str: string): string {
  try {
    return btoa(unescape(encodeURIComponent(str)));
  } catch {
    return btoa(str);
  }
}

async function webdavRequest(
  config: WebDAVConfig,
  method: 'PUT' | 'GET' | 'PROPFIND' | 'DELETE' | 'MKCOL',
  path: string,
  body?: string
): Promise<{ ok: boolean; status: number; body?: string; error?: string }> {
  try {
    const auth = base64Encode(`${config.username}:${config.password}`);
    const headers: Record<string, string> = {
      Authorization: `Basic ${auth}`,
    };

    if (body) {
      headers['Content-Type'] = 'application/octet-stream';
    }
    if (method === 'PROPFIND') {
      headers['Depth'] = '1';
    }

    const response = await fetch(`${config.url.replace(/\/$/, '')}${path}`, {
      method,
      headers,
      body,
    });

    const responseText = await response.text().catch(() => undefined);

    return {
      ok: response.ok,
      status: response.status,
      body: responseText,
    };
  } catch (e) {
    return {
      ok: false,
      status: 0,
      error: e instanceof Error ? e.message : '网络连接失败',
    };
  }
}

export async function configure_webdav(params: {
  url: string;
  username: string;
  password: string;
  enabled?: boolean;
}): Promise<ToolResult> {
  try {
    if (!params.url || !params.url.trim()) {
      return { success: false, error: 'WebDAV 服务器地址不能为空' };
    }
    if (!params.username || !params.password) {
      return { success: false, error: '用户名和密码不能为空' };
    }

    const db = await getDatabase();
    const existing = await getConfig(db);
    const config: WebDAVConfig = {
      url: params.url.trim(),
      username: params.username,
      password: params.password,
      enabled: params.enabled !== false,
      lastSyncAt: existing?.lastSyncAt,
      lastSyncStatus: existing?.lastSyncStatus,
    };

    const testResult = await webdavRequest(config, 'PROPFIND', '/');
    if (!testResult.ok && testResult.status !== 207) {
      return {
        success: false,
        error: `无法连接到 WebDAV 服务器 (HTTP ${testResult.status}): ${testResult.error || '连接失败'}`,
      };
    }

    await saveConfig(db, config);
    logger.info('WebDAV', 'Configuration saved and verified');

    return {
      success: true,
      data: {
        url: config.url,
        enabled: config.enabled,
        testResult: testResult.ok ? '连接成功' : '已保存但连接测试未通过',
      },
    };
  } catch (e) {
    captureError('configure_webdav', e, 'Failed to configure WebDAV');
    return { success: false, error: '配置 WebDAV 时发生异常' };
  }
}

export async function sync_upload(params?: {
  subfolder?: string;
  encrypt?: boolean;
  passphrase?: string;
}): Promise<ToolResult> {
  try {
    const db = await getDatabase();
    const config = await getConfig(db);

    if (!config || !config.enabled) {
      return { success: false, error: '请先配置并启用 WebDAV 同步' };
    }

    const tables = ['bills', 'debts', 'repayments', 'assets', 'tags', 'bill_tags', 'savings_goals', 'achievements', 'classification_rules', 'recurring_tasks', 'reimbursement_tasks'];
    const backup: Record<string, unknown> = {
      _metadata: {
        backupType: 'webdav_sync',
        createdAt: new Date().toISOString(),
        version: '0.1.0',
        tables: tables.length,
      },
    };

    for (const table of tables) {
      try {
        const rows = await db.getAllAsync(`SELECT * FROM ${table} LIMIT 5000`);
        backup[table] = rows;
      } catch {
        backup[table] = [];
      }
    }

    const folder = params?.subfolder ? `/wealth_manager/${params.subfolder.replace(/^\//, '')}` : '/wealth_manager';
    await webdavRequest(config, 'MKCOL', folder);

    const now = new Date();
    const filename = `sync_${now.getFullYear()}${(now.getMonth() + 1).toString().padStart(2, '0')}${now.getDate().toString().padStart(2, '0')}_${now.getHours().toString().padStart(2, '0')}${now.getMinutes().toString().padStart(2, '0')}.json`;
    const path = `${folder}/${filename}`;
    const content = JSON.stringify(backup);
    let finalContent = content;
    let encryptionInfo: { encrypted: boolean; salt?: string } = { encrypted: false };

    if (params?.encrypt && params?.passphrase) {
      const encrypted = encryptPayload(content, params.passphrase);
      if (encrypted) {
        finalContent = encrypted.ciphertext;
        encryptionInfo = { encrypted: true, salt: encrypted.salt };
        logger.info('WebDAV', `Encrypted payload before upload (salt: ${encrypted.salt.slice(0, 8)}...)`);
      }
    }

    const result = await webdavRequest(config, 'PUT', path, finalContent);

    if (!result.ok) {
      await updateLastSync(db, 'error');
      return { success: false, error: `上传失败 (HTTP ${result.status})` };
    }

    await updateLastSync(db, 'success');
    logger.info('WebDAV', `Uploaded ${filename} (${(content.length / 1024).toFixed(1)}KB)`);

    return {
      success: true,
      data: {
        filename,
        path,
        size: finalContent.length,
        tableCount: tables.length,
        encrypted: encryptionInfo.encrypted,
        salt: encryptionInfo.salt,
      },
    };
  } catch (e) {
    captureError('sync_upload', e, 'Failed to upload sync');
    return { success: false, error: '上传同步数据时发生异常' };
  }
}

export async function sync_download(params?: {
  filename?: string;
  subfolder?: string;
  mergeStrategy?: 'overwrite' | 'merge_newer' | 'merge_all';
  decrypt?: boolean;
  passphrase?: string;
  salt?: string;
}): Promise<ToolResult> {
  try {
    const db = await getDatabase();
    const config = await getConfig(db);

    if (!config || !config.enabled) {
      return { success: false, error: '请先配置并启用 WebDAV 同步' };
    }

    const folder = params?.subfolder ? `/wealth_manager/${params.subfolder.replace(/^\//, '')}` : '/wealth_manager';

    let filename: string;
    if (params?.filename) {
      filename = params.filename;
    } else {
      const listResult = await webdavRequest(config, 'PROPFIND', folder);
      if (!listResult.ok) {
        return { success: false, error: '无法列出服务器文件' };
      }
      const latest = extractLatestSyncFile(listResult.body || '');
      if (!latest) {
        return { success: false, error: '服务器上没有找到同步文件' };
      }
      filename = latest;
    }

    const path = `${folder}/${filename}`;
    const result = await webdavRequest(config, 'GET', path);

    if (!result.ok || !result.body) {
      await updateLastSync(db, 'error');
      return { success: false, error: `下载失败 (HTTP ${result.status})` };
    }

    let rawData = result.body;
    if (params?.decrypt && params?.passphrase && params?.salt) {
      const decrypted = decryptPayload(rawData, params.passphrase, params.salt);
      if (!decrypted) {
        return { success: false, error: '解密失败：密码错误或数据已损坏' };
      }
      rawData = decrypted;
      logger.info('WebDAV', 'Decrypted downloaded payload');
    }

    let backup: Record<string, unknown>;
    try {
      backup = JSON.parse(rawData);
    } catch {
      return { success: false, error: '同步文件格式无效' };
    }

    const strategy = params?.mergeStrategy || 'merge_newer';
    const stats = await mergeData(db, backup, strategy);

    await updateLastSync(db, 'success');
    logger.info('WebDAV', `Downloaded ${filename}, merged: ${JSON.stringify(stats)}`);

    return {
      success: true,
      data: {
        filename,
        size: result.body.length,
        ...stats,
      },
    };
  } catch (e) {
    captureError('sync_download', e, 'Failed to download sync');
    return { success: false, error: '下载同步数据时发生异常' };
  }
}

export async function get_sync_status(): Promise<ToolResult> {
  try {
    const db = await getDatabase();
    const config = await getConfig(db);

    const lastSyncRow = await db.getFirstAsync<{ value: string; updated_at: string }>(
      "SELECT value, updated_at FROM sync_state WHERE key = 'last_sync'"
    );

    let lastSync: { timestamp: string; status: string } | null = null;
    if (lastSyncRow) {
      try {
        lastSync = JSON.parse(lastSyncRow.value);
      } catch {
        lastSync = { timestamp: lastSyncRow.updated_at, status: 'unknown' };
      }
    }

    return {
      success: true,
      data: {
        configured: !!config,
        enabled: config?.enabled || false,
        serverUrl: config?.url || null,
        lastSync,
      },
    };
  } catch (e) {
    captureError('get_sync_status', e, 'Failed to get sync status');
    return { success: false, error: '获取同步状态时发生异常' };
  }
}

function extractLatestSyncFile(propfindXml: string): string | null {
  const files = propfindXml.match(/<D:href>([^<]+\.json)<\/D:href>/gi);
  if (!files || files.length === 0) return null;

  const synclist = files
    .map((f) => f.replace(/<D:href>/i, '').replace(/<\/D:href>/i, '').trim())
    .filter((f) => f.endsWith('.json'))
    .sort()
    .reverse();

  const latest = synclist[0];
  if (latest) {
    const parts = latest.split('/');
    return parts[parts.length - 1];
  }
  return null;
}

async function mergeData(
  db: Awaited<ReturnType<typeof getDatabase>>,
  backup: Record<string, unknown>,
  strategy: 'overwrite' | 'merge_newer' | 'merge_all'
): Promise<{ billsImported: number; mergedTables: string[]; errors: number }> {
  const mergedTables: string[] = [];
  let billsImported = 0;
  let errors = 0;

  const billTables = ['bills', 'debts', 'repayments', 'assets', 'savings_goals', 'achievements', 'classification_rules', 'recurring_tasks', 'reimbursement_tasks'];

  for (const table of billTables) {
    const rows = backup[table];
    if (!Array.isArray(rows) || rows.length === 0) continue;

    try {
      if (strategy === 'overwrite') {
        await db.runAsync(`DELETE FROM ${table}`);
      }

      for (const row of rows as Record<string, unknown>[]) {
        try {
          if (strategy === 'merge_newer' && table === 'bills') {
            const existing = await db.getFirstAsync(
              `SELECT id FROM ${table} WHERE id = ?`,
              [row.id as string]
            );
            if (existing && row.created_at) {
              const existingRow = await db.getFirstAsync<{ created_at: string }>(
                `SELECT created_at FROM ${table} WHERE id = ?`, [row.id as string]
              );
              if (existingRow && existingRow.created_at >= String(row.created_at)) {
                continue;
              }
            }
          }

          const columns = Object.keys(row).filter((k) => !k.startsWith('_'));
          if (columns.length === 0) continue;

          const placeholders = columns.map(() => '?').join(', ');
          const values = columns.map((k) => row[k] as string | number | null);

          await db.runAsync(
            `INSERT OR REPLACE INTO ${table} (${columns.join(', ')}) VALUES (${placeholders})`,
            values as any
          );

          if (table === 'bills') billsImported++;
        } catch {
          errors++;
        }
      }
      mergedTables.push(table);
    } catch {
      errors++;
    }
  }

  return { billsImported, mergedTables, errors };
}

export async function list_sync_files(params?: {
  subfolder?: string;
}): Promise<ToolResult> {
  try {
    const db = await getDatabase();
    const config = await getConfig(db);

    if (!config || !config.enabled) {
      return { success: false, error: '请先配置并启用 WebDAV 同步' };
    }

    const folder = params?.subfolder ? `/wealth_manager/${params.subfolder.replace(/^\//, '')}` : '/wealth_manager';
    const result = await webdavRequest(config, 'PROPFIND', folder);

    if (!result.ok || !result.body) {
      return { success: false, error: `无法列出文件 (HTTP ${result.status})` };
    }

    const files: { name: string; path: string; lastModified?: string }[] = [];
    const hrefMatches = result.body.matchAll(/<D:href>([^<]+\.json)<\/D:href>/gi);

    for (const match of hrefMatches) {
      const fullPath = match[1].replace(/<D:href>/i, '').replace(/<\/D:href>/i, '').trim();
      const parts = fullPath.split('/');
      const name = parts[parts.length - 1];
      files.push({ name, path: fullPath });
    }

    files.sort((a, b) => b.name.localeCompare(a.name));

    return {
      success: true,
      data: {
        folder,
        fileCount: files.length,
        files: files.slice(0, 50),
      },
    };
  } catch (e) {
    captureError('list_sync_files', e, 'Failed to list sync files');
    return { success: false, error: '列出同步文件时发生异常' };
  }
}
