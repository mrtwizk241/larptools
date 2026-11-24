// Staff-mode PIN.
//
// This is a convenience lock, not security. It stops accidental edits on a shared device. Anyone
// with the device and browser dev tools can read or change local data, and a 4 to 8 digit PIN can
// be brute-forced from its hash in moments. Never reuse a real PIN or password here.
//
// Hash: SHA-256 (Web Crypto) over the 16 salt bytes followed by the PIN's UTF-8 bytes.
// Salt and hash are stored as lowercase hex in settings (`pinSalt`, `pinHash`).

const PIN_PATTERN = /^\d{4,8}$/;
const SALT_BYTES = 16;

/** True for 4 to 8 ASCII digits. */
export function isValidPin(pin: string): boolean {
  return PIN_PATTERN.test(pin);
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

function fromHex(hex: string): Uint8Array<ArrayBuffer> | undefined {
  if (!/^(?:[0-9a-f]{2})+$/.test(hex)) return undefined;
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i += 1) bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return bytes;
}

async function digest(saltBytes: Uint8Array, pin: string): Promise<string> {
  const pinBytes = new TextEncoder().encode(pin);
  const data = new Uint8Array(saltBytes.length + pinBytes.length);
  data.set(saltBytes, 0);
  data.set(pinBytes, saltBytes.length);
  return toHex(new Uint8Array(await crypto.subtle.digest('SHA-256', data)));
}

/**
 * Hashes a PIN with the given hex salt, or a fresh random 16-byte salt.
 * Throws when the PIN is not 4 to 8 digits or the salt is not 32 hex characters.
 */
export async function hashPin(pin: string, salt?: string): Promise<{ hash: string; salt: string }> {
  if (!isValidPin(pin)) throw new Error('PIN must be 4 to 8 digits.');
  let saltBytes: Uint8Array;
  if (salt === undefined) {
    saltBytes = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  } else {
    const parsed = fromHex(salt);
    if (!parsed || parsed.length !== SALT_BYTES) throw new Error('Salt must be 32 hex characters.');
    saltBytes = parsed;
  }
  return { hash: await digest(saltBytes, pin), salt: toHex(saltBytes) };
}

/** True when the PIN matches the stored hash and salt. False for any malformed input. */
export async function verifyPin(pin: string, hash: string, salt: string): Promise<boolean> {
  if (!isValidPin(pin)) return false;
  const saltBytes = fromHex(salt);
  if (!saltBytes || saltBytes.length !== SALT_BYTES) return false;
  const actual = await digest(saltBytes, pin);
  if (actual.length !== hash.length) return false;
  let diff = 0;
  for (let i = 0; i < actual.length; i += 1) diff |= actual.charCodeAt(i) ^ hash.charCodeAt(i);
  return diff === 0;
}
