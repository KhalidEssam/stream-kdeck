import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12;
const KEY_BYTES = 32;

export function hashOAuthState(rawState: string): string {
  return createHash('sha256').update(rawState).digest('hex');
}

export function generateRawState(): string {
  return randomBytes(32).toString('hex');
}

export function createPkcePair(): { verifier: string; challenge: string } {
  const verifier = randomBytes(32).toString('base64url');
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  return { verifier, challenge };
}

export function encryptSecret(plaintext: string): string {
  const key = getEncryptionKey();
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('hex')}.${tag.toString('hex')}.${encrypted.toString('hex')}`;
}

export function decryptSecret(ciphertext: string): string {
  const key = getEncryptionKey();
  const [ivHex, tagHex, dataHex] = ciphertext.split('.');
  if (!ivHex || !tagHex || !dataHex) {
    throw new Error('Invalid ciphertext format');
  }

  const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(dataHex, 'hex')),
    decipher.final(),
  ]);
  return decrypted.toString('utf8');
}

function getEncryptionKey(): Buffer {
  const raw = process.env.OAUTH_TOKEN_ENCRYPTION_KEY?.trim();
  if (!raw) throw new Error('OAUTH_TOKEN_ENCRYPTION_KEY is not set');

  const key = /^[0-9a-f]{64}$/i.test(raw)
    ? Buffer.from(raw, 'hex')
    : Buffer.from(raw, 'base64');

  if (key.length !== KEY_BYTES) {
    throw new Error('OAUTH_TOKEN_ENCRYPTION_KEY must decode to 32 bytes');
  }

  return key;
}
