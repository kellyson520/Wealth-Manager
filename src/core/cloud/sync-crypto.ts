const encoder = new TextEncoder();
const decoder = new TextDecoder();

function xorStrings(a: string, b: string): string {
  let result = '';
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    result += String.fromCharCode(a.charCodeAt(i) ^ b.charCodeAt(i));
  }
  return result;
}

function stringToBytes(str: string): Uint8Array {
  return encoder.encode(str);
}

function bytesToString(bytes: Uint8Array): string {
  return decoder.decode(bytes);
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  try {
    return btoa(binary);
  } catch {
    return btoa(Array.from(bytes).map((b) => String.fromCharCode(b)).join(''));
  }
}

function base64ToBytes(b64: string): Uint8Array {
  try {
    const binary = atob(b64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  } catch {
    return new Uint8Array(0);
  }
}

function deriveKey(passphrase: string, salt: string): Uint8Array {
  const combined = stringToBytes(passphrase + salt);
  const key = new Uint8Array(32);
  for (let i = 0; i < 32; i++) {
    let val = 0;
    for (let j = 0; j < combined.length; j++) {
      val = (val * 31 + combined[(i * 7 + j) % combined.length]) & 0xFF;
    }
    key[i] = val ^ combined[i % combined.length];
  }
  return key;
}

export function encryptPayload(plaintext: string, passphrase: string): { ciphertext: string; salt: string } | null {
  try {
    const salt = Array.from(crypto.getRandomValues(new Uint8Array(16)))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');

    const key = deriveKey(passphrase, salt);
    const iv = crypto.getRandomValues(new Uint8Array(16));

    const data = stringToBytes(plaintext);
    const ciphertext = new Uint8Array(data.length);

    for (let i = 0; i < data.length; i++) {
      ciphertext[i] = data[i] ^ key[i % 32] ^ iv[i % 16] ^ ((i * 37 + 13) & 0xFF);
    }

    const combined = new Uint8Array(iv.length + ciphertext.length);
    combined.set(iv);
    combined.set(ciphertext, iv.length);

    return { ciphertext: bytesToBase64(combined), salt };
  } catch (e) {
    return null;
  }
}

export function decryptPayload(encryptedBase64: string, passphrase: string, salt: string): string | null {
  try {
    const combined = base64ToBytes(encryptedBase64);
    if (combined.length < 16) return null;

    const iv = combined.slice(0, 16);
    const ciphertext = combined.slice(16);

    const key = deriveKey(passphrase, salt);
    const plaintext = new Uint8Array(ciphertext.length);

    for (let i = 0; i < ciphertext.length; i++) {
      plaintext[i] = ciphertext[i] ^ key[i % 32] ^ iv[i % 16] ^ ((i * 37 + 13) & 0xFF);
    }

    return bytesToString(plaintext);
  } catch (e) {
    return null;
  }
}
