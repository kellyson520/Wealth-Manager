const PBKDF2_ITERATIONS = 120000;
const SALT_BYTES = 16;
const IV_BYTES = 12;

type CryptoRuntime = {
  crypto: Crypto;
  encoder: TextEncoder;
  decoder: TextDecoder;
};

function getCryptoRuntime(): CryptoRuntime | null {
  const cryptoObj = globalThis.crypto;
  if (!cryptoObj?.subtle || typeof cryptoObj.getRandomValues !== 'function') {
    return null;
  }
  if (typeof globalThis.TextEncoder !== 'function' || typeof globalThis.TextDecoder !== 'function') {
    return null;
  }
  return {
    crypto: cryptoObj,
    encoder: new TextEncoder(),
    decoder: new TextDecoder(),
  };
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function randomBytes(cryptoObj: Crypto, length: number): Uint8Array {
  return cryptoObj.getRandomValues(new Uint8Array(length));
}

async function deriveKey(
  runtime: CryptoRuntime,
  passphrase: string,
  salt: Uint8Array
): Promise<CryptoKey> {
  const keyMaterial = await runtime.crypto.subtle.importKey(
    'raw',
    runtime.encoder.encode(passphrase),
    'PBKDF2',
    false,
    ['deriveKey']
  );

  return runtime.crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt,
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

export async function encryptPayload(
  plaintext: string,
  passphrase: string
): Promise<{ ciphertext: string; salt: string } | null> {
  try {
    const runtime = getCryptoRuntime();
    if (!runtime) return null;
    const salt = randomBytes(runtime.crypto, SALT_BYTES);
    const iv = randomBytes(runtime.crypto, IV_BYTES);
    const key = await deriveKey(runtime, passphrase, salt);
    const encrypted = new Uint8Array(
      await runtime.crypto.subtle.encrypt(
        { name: 'AES-GCM', iv },
        key,
        runtime.encoder.encode(plaintext)
      )
    );

    const combined = new Uint8Array(iv.length + encrypted.length);
    combined.set(iv);
    combined.set(encrypted, iv.length);

    return {
      ciphertext: bytesToBase64(combined),
      salt: bytesToBase64(salt),
    };
  } catch {
    return null;
  }
}

export async function decryptPayload(
  encryptedBase64: string,
  passphrase: string,
  saltBase64: string
): Promise<string | null> {
  try {
    const runtime = getCryptoRuntime();
    if (!runtime) return null;
    const combined = base64ToBytes(encryptedBase64);
    if (combined.length <= IV_BYTES) return null;

    const iv = combined.slice(0, IV_BYTES);
    const ciphertext = combined.slice(IV_BYTES);
    const salt = base64ToBytes(saltBase64);
    const key = await deriveKey(runtime, passphrase, salt);

    const decrypted = await runtime.crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      key,
      ciphertext
    );

    return runtime.decoder.decode(decrypted);
  } catch {
    return null;
  }
}
