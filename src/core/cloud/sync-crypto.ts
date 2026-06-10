const encoder = new TextEncoder();
const decoder = new TextDecoder();

const PBKDF2_ITERATIONS = 120000;
const SALT_BYTES = 16;
const IV_BYTES = 12;
const SECRET_BYTES = 32;

type WebCryptoApi = Crypto;

function getWebCrypto(): WebCryptoApi | null {
  if (typeof globalThis.crypto?.subtle !== 'undefined') {
    return globalThis.crypto;
  }

  try {
    const nodeCrypto = require('crypto') as { webcrypto?: WebCryptoApi };
    if (nodeCrypto.webcrypto?.subtle) {
      return nodeCrypto.webcrypto;
    }
  } catch {
    // Ignore missing Node crypto fallback in runtime environments that do not expose require().
  }

  return null;
}

function bytesToBase64(bytes: Uint8Array): string {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(bytes).toString('base64');
  }

  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToBytes(b64: string): Uint8Array {
  if (typeof Buffer !== 'undefined') {
    return new Uint8Array(Buffer.from(b64, 'base64'));
  }

  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function randomBytes(webCrypto: WebCryptoApi, length: number): Uint8Array {
  return webCrypto.getRandomValues(new Uint8Array(length));
}

function getRandomBytes(length: number): Uint8Array {
  const webCrypto = getWebCrypto();
  if (!webCrypto?.getRandomValues) {
    throw new Error('secure random unavailable');
  }
  return randomBytes(webCrypto, length);
}

export function generateSecureSecret(): string {
  return bytesToBase64(getRandomBytes(SECRET_BYTES));
}

async function deriveKey(
  webCrypto: WebCryptoApi,
  passphrase: string,
  salt: Uint8Array
): Promise<CryptoKey> {
  const keyMaterial = await webCrypto.subtle.importKey(
    'raw',
    encoder.encode(passphrase),
    'PBKDF2',
    false,
    ['deriveKey']
  );

  return webCrypto.subtle.deriveKey(
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
): Promise<{ ciphertext: string; salt: string }> {
  const webCrypto = getWebCrypto();
  if (!webCrypto?.subtle) {
    throw new Error(
      'crypto.subtle unavailable — cannot encrypt. ' +
      'Ensure a secure runtime (HTTPS context or Node.js with webcrypto).'
    );
  }

  const salt = randomBytes(webCrypto, SALT_BYTES);
  const iv = randomBytes(webCrypto, IV_BYTES);
  const key = await deriveKey(webCrypto, passphrase, salt);
  const encrypted = new Uint8Array(
    await webCrypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      key,
      encoder.encode(plaintext)
    )
  );

  const combined = new Uint8Array(iv.length + encrypted.length);
  combined.set(iv);
  combined.set(encrypted, iv.length);

  return {
    ciphertext: bytesToBase64(combined),
    salt: bytesToBase64(salt),
  };
}

export async function decryptPayload(
  encryptedBase64: string,
  passphrase: string,
  saltBase64: string
): Promise<string> {
  const webCrypto = getWebCrypto();
  if (!webCrypto?.subtle) {
    throw new Error(
      'crypto.subtle unavailable — cannot decrypt. ' +
      'Ensure a secure runtime (HTTPS context or Node.js with webcrypto).'
    );
  }

  const combined = base64ToBytes(encryptedBase64);
  if (combined.length <= IV_BYTES) {
    throw new Error('Invalid ciphertext: too short');
  }

  const iv = combined.slice(0, IV_BYTES);
  const ciphertext = combined.slice(IV_BYTES);
  const salt = base64ToBytes(saltBase64);
  const key = await deriveKey(webCrypto, passphrase, salt);

  const decrypted = await webCrypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    ciphertext
  );

  return decoder.decode(decrypted);
}
