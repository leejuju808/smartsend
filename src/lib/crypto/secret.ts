import crypto from "crypto";

/**
 * AES-256-GCM encrypt/decrypt with a single app secret.
 * We store only ciphertext in DB; decryption happens server-side only.
 *
 * ENV: ENCRYPTION_KEY must be 32 bytes (base64 or utf8 length 32).
 */
function getKey(): Buffer {
  const raw = process.env.ENCRYPTION_KEY || "";
  if (!raw) throw new Error("ENCRYPTION_KEY missing");
  // Accept base64 or utf8 32-char
  if (raw.length === 32) return Buffer.from(raw, "utf8");
  const b = Buffer.from(raw, "base64");
  if (b.length !== 32) throw new Error("ENCRYPTION_KEY must be 32 bytes (utf8 len 32 or base64)");
  return b;
}

export function encryptSecret(plain: string): string {
  const key = getKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString("base64"); // iv(12) + tag(16) + enc
}

export function decryptSecret(ciphertext: string): string {
  const key = getKey();
  const buf = Buffer.from(ciphertext, "base64");
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const enc = buf.subarray(28);
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  const dec = Buffer.concat([decipher.update(enc), decipher.final()]);
  return dec.toString("utf8");
}