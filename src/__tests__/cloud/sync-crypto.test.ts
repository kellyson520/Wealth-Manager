import { decryptPayload, encryptPayload } from '../../core/cloud/sync-crypto';

describe('sync crypto', () => {
  test('encrypts and decrypts payloads with AES-GCM', async () => {
    const plaintext = JSON.stringify({ secret: 'top-secret', amount: 123.45 });
    const encrypted = await encryptPayload(plaintext, 'correct horse battery staple');

    expect(encrypted.ciphertext).toBeDefined();
    expect(encrypted.ciphertext).not.toContain('top-secret');
    expect(encrypted.salt).toBeDefined();

    const decrypted = await decryptPayload(
      encrypted.ciphertext,
      'correct horse battery staple',
      encrypted.salt
    );

    expect(decrypted).toBe(plaintext);
  });

  test('throws error for an incorrect passphrase', async () => {
    const encrypted = await encryptPayload('classified', 'passphrase-a');

    await expect(
      decryptPayload(encrypted.ciphertext, 'passphrase-b', encrypted.salt)
    ).rejects.toThrow();
  });
});
