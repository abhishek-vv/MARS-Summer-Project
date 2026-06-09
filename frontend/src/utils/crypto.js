/**
 * Generates a cryptographically secure random AES-GCM 256-bit key.
 */
export async function generateAESKey() {
  return await window.crypto.subtle.generateKey(
    {
      name: 'AES-GCM',
      length: 256
    },
    true, // extractable
    ['encrypt', 'decrypt']
  );
}

/**
 * Exports a CryptoKey to a Hex string.
 */
export async function exportKeyToHex(key) {
  const exported = await window.crypto.subtle.exportKey('raw', key);
  const hashArray = Array.from(new Uint8Array(exported));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Imports a CryptoKey from a Hex string.
 */
export async function importKeyFromHex(hexString) {
  if (!hexString || hexString.length !== 64) {
    throw new Error('Invalid key length for AES-256-GCM hex string');
  }
  const bytes = new Uint8Array(hexString.match(/.{1,2}/g).map(byte => parseInt(byte, 16)));
  return await window.crypto.subtle.importKey(
    'raw',
    bytes,
    { name: 'AES-GCM' },
    true,
    ['encrypt', 'decrypt']
  );
}

/**
 * Encrypts a chunk of data (ArrayBuffer) using AES-GCM with a random IV.
 * Prepends the 12-byte IV to the ciphertext.
 */
export async function encryptChunk(arrayBuffer, key) {
  const iv = window.crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await window.crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv: iv
    },
    key,
    arrayBuffer
  );

  // Prepend IV to ciphertext
  const result = new Uint8Array(iv.length + encrypted.byteLength);
  result.set(iv, 0);
  result.set(new Uint8Array(encrypted), iv.length);
  return result.buffer;
}

/**
 * Decrypts a chunk of data (ArrayBuffer) that has the 12-byte IV prepended.
 */
export async function decryptChunk(encryptedArrayBuffer, key) {
  const dataView = new Uint8Array(encryptedArrayBuffer);
  const iv = dataView.slice(0, 12);
  const ciphertext = dataView.slice(12);

  const decrypted = await window.crypto.subtle.decrypt(
    {
      name: 'AES-GCM',
      iv: iv
    },
    key,
    ciphertext.buffer
  );
  return decrypted;
}

/**
 * Computes the SHA-256 hash of an ArrayBuffer and returns it as a Hex string.
 */
export async function computeSHA256(arrayBuffer) {
  const hashBuffer = await window.crypto.subtle.digest('SHA-256', arrayBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}
