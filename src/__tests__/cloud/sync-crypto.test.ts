describe('sync crypto runtime compatibility', () => {
  const originalTextEncoder = global.TextEncoder;
  const originalTextDecoder = global.TextDecoder;

  afterEach(() => {
    jest.resetModules();
    global.TextEncoder = originalTextEncoder;
    global.TextDecoder = originalTextDecoder;
  });

  test('can be imported when TextEncoder is unavailable on native startup', () => {
    (global as any).TextEncoder = undefined;
    (global as any).TextDecoder = undefined;

    expect(() => require('../../core/cloud/sync-crypto')).not.toThrow();
  });

  test('returns null instead of throwing when WebCrypto text codecs are unavailable', async () => {
    (global as any).TextEncoder = undefined;
    (global as any).TextDecoder = undefined;
    jest.resetModules();

    const { encryptPayload, decryptPayload } = require('../../core/cloud/sync-crypto');

    await expect(encryptPayload('payload', 'passphrase')).resolves.toBeNull();
    await expect(decryptPayload('payload', 'passphrase', 'salt')).resolves.toBeNull();
  });
});
