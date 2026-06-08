jest.mock('../../core/database/database', () => {
  const mockDb = {
    runAsync: jest.fn().mockResolvedValue({ changes: 1 }),
    getFirstAsync: jest.fn(),
    getAllAsync: jest.fn().mockResolvedValue([]),
  };

  return {
    getDatabase: jest.fn().mockResolvedValue(mockDb),
  };
});

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn().mockResolvedValue(undefined),
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 1,
}));

import { decryptPayload, encryptPayload } from '../../core/cloud/sync-crypto';
import { getDatabase } from '../../core/database/database';
import { configure_webdav, get_sync_status } from '../../tools/webdav/sync.tool';
import * as SecureStore from 'expo-secure-store';

const secureStore = SecureStore as jest.Mocked<typeof SecureStore>;

function getMockDb() {
  return getDatabase() as any;
}

describe('WebDAV credential encryption', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    const mockDb = await getMockDb();
    mockDb.getFirstAsync.mockResolvedValue(null);
    mockDb.getAllAsync.mockResolvedValue([]);
    (globalThis as any).fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 207,
      text: jest.fn().mockResolvedValue(''),
    });
  });

  test('stores WebDAV password with a SecureStore secret instead of predictable config values', async () => {
    secureStore.getItemAsync.mockResolvedValue(null);

    const result = await configure_webdav({
      url: 'https://dav.example.com',
      username: 'alice',
      password: 'webdav-password',
    });

    expect(result.success).toBe(true);
    expect(secureStore.setItemAsync).toHaveBeenCalledWith(
      'wealth-manager-webdav-config-secret-v2',
      expect.any(String),
      { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY }
    );

    const secureSecret = secureStore.setItemAsync.mock.calls[0][1];
    const mockDb = await getMockDb();
    const saved = JSON.parse(mockDb.runAsync.mock.calls[0][1][0]);

    expect(saved.password).toBeUndefined();
    expect(saved.passwordCiphertext).toBeDefined();
    expect(saved.passwordSalt).toBeDefined();

    await expect(
      decryptPayload(
        saved.passwordCiphertext,
        'wealth-manager-webdav-config-secret-v1:https://dav.example.com:alice',
        saved.passwordSalt
      )
    ).resolves.toBeNull();
    await expect(
      decryptPayload(saved.passwordCiphertext, secureSecret, saved.passwordSalt)
    ).resolves.toBe('webdav-password');
  });

  test('migrates legacy predictable-key ciphertext to the SecureStore-backed key', async () => {
    const legacyKey = 'wealth-manager-webdav-config-secret-v1:https://dav.example.com:alice';
    const legacyEncrypted = await encryptPayload('legacy-password', legacyKey);
    expect(legacyEncrypted).not.toBeNull();

    const mockDb = await getMockDb();
    mockDb.getFirstAsync
      .mockResolvedValueOnce({
        value: JSON.stringify({
          url: 'https://dav.example.com',
          username: 'alice',
          passwordCiphertext: legacyEncrypted!.ciphertext,
          passwordSalt: legacyEncrypted!.salt,
          enabled: true,
        }),
      })
      .mockResolvedValueOnce(null);
    secureStore.getItemAsync.mockResolvedValue('modern-secure-store-secret-32-bytes');

    const result = await get_sync_status();

    expect(result.success).toBe(true);
    expect(mockDb.runAsync).toHaveBeenCalledWith(
      "INSERT OR REPLACE INTO sync_state (key, value, updated_at) VALUES ('webdav_config', ?, ?)",
      expect.any(Array)
    );

    const saved = JSON.parse(mockDb.runAsync.mock.calls[0][1][0]);
    expect(saved.password).toBeUndefined();
    expect(saved.passwordCiphertext).not.toBe(legacyEncrypted!.ciphertext);
    await expect(
      decryptPayload(saved.passwordCiphertext, legacyKey, saved.passwordSalt)
    ).resolves.toBeNull();
    await expect(
      decryptPayload(saved.passwordCiphertext, 'modern-secure-store-secret-32-bytes', saved.passwordSalt)
    ).resolves.toBe('legacy-password');
  });
});
