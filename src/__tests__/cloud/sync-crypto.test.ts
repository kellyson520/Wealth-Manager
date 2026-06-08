import { decryptPayload, encryptPayload } from '../../core/cloud/sync-crypto';

describe('sync crypto', () => {
  test('encrypts and decrypts payloads with AES-GCM', async () => {
    const plaintext = JSON.stringify({ secret: 'top-secret', amount: 123.45 });
    const encrypted = await encryptPayload(plaintext, 'correct horse battery staple');

    expect(encrypted).not.toBeNull();
    expect(encrypted?.ciphertext).toBeDefined();
    expect(encrypted?.ciphertext).not.toContain('top-secret');
    expect(encrypted?.salt).toBeDefined();

    const decrypted = await decryptPayload(
      encrypted!.ciphertext,
      'correct horse battery staple',
      encrypted!.salt
    );

    expect(decrypted).toBe(plaintext);
  });

  test('returns null for an incorrect passphrase', async () => {
    const encrypted = await encryptPayload('classified', 'passphrase-a');
    expect(encrypted).not.toBeNull();

    const decrypted = await decryptPayload(
      encrypted!.ciphertext,
      'passphrase-b',
      encrypted!.salt
    );

    expect(decrypted).toBeNull();
  });
});
