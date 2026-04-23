/**
 * AES-GCM encryption helpers for storing OAuth tokens at rest.
 *
 * Key source: TOKEN_ENCRYPTION_KEY env var (base64-encoded 32-byte key).
 * Both ciphertext and IV are returned/accepted as base64 strings.
 *
 * Usage:
 *   const { ciphertext, iv } = await encrypt('my-secret-token')
 *   const plaintext = await decrypt(ciphertext, iv)
 */

const ALGORITHM = 'AES-GCM'
const KEY_LENGTH = 256 // bits

/** Import the raw AES key from the base64-encoded TOKEN_ENCRYPTION_KEY env var. */
async function importKey(): Promise<CryptoKey> {
  const base64Key = Deno.env.get('TOKEN_ENCRYPTION_KEY')
  if (!base64Key) {
    throw new Error('TOKEN_ENCRYPTION_KEY environment variable is not set')
  }

  const rawKey = Uint8Array.from(atob(base64Key), (char) => char.charCodeAt(0))
  if (rawKey.length !== KEY_LENGTH / 8) {
    throw new Error(
      `TOKEN_ENCRYPTION_KEY must be ${KEY_LENGTH / 8} bytes (${KEY_LENGTH}-bit). ` +
      `Got ${rawKey.length} bytes. Generate with: openssl rand -base64 32`,
    )
  }

  return crypto.subtle.importKey(
    'raw',
    rawKey,
    { name: ALGORITHM },
    false, // not extractable
    ['encrypt', 'decrypt'],
  )
}

/** Encode a Uint8Array to a base64 string. */
function toBase64(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
}

/** Decode a base64 string to a Uint8Array. */
function fromBase64(base64: string): Uint8Array {
  return Uint8Array.from(atob(base64), (char) => char.charCodeAt(0))
}

/**
 * Encrypt a plaintext string using AES-GCM.
 *
 * @param plaintext - The string to encrypt.
 * @returns An object with `ciphertext` and `iv`, both base64-encoded.
 *          Store both fields; you need both to decrypt.
 */
export async function encrypt(plaintext: string): Promise<{ ciphertext: string; iv: string }> {
  const key = await importKey()
  const ivBytes = crypto.getRandomValues(new Uint8Array(12)) // 96-bit IV for AES-GCM
  const encodedText = new TextEncoder().encode(plaintext)

  const encryptedBuffer = await crypto.subtle.encrypt(
    { name: ALGORITHM, iv: ivBytes },
    key,
    encodedText,
  )

  return {
    ciphertext: toBase64(new Uint8Array(encryptedBuffer)),
    iv: toBase64(ivBytes),
  }
}

/**
 * Decrypt a ciphertext that was produced by `encrypt`.
 *
 * @param ciphertext - Base64-encoded ciphertext.
 * @param iv - Base64-encoded IV (must match the one returned by `encrypt`).
 * @returns The original plaintext string.
 */
export async function decrypt(ciphertext: string, iv: string): Promise<string> {
  const key = await importKey()
  const ivBytes = fromBase64(iv)
  const ciphertextBytes = fromBase64(ciphertext)

  const decryptedBuffer = await crypto.subtle.decrypt(
    { name: ALGORITHM, iv: ivBytes },
    key,
    ciphertextBytes,
  )

  return new TextDecoder().decode(decryptedBuffer)
}
