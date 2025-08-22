import crypto from "crypto";

const SECRET = process.env.EVENTS_SIGNING_SECRET!;

export function sign(payload: string): string {
  return crypto
    .createHmac("sha256", SECRET)
    .update(payload)
    .digest("hex")
    .slice(0, 16);
}

export function verify(payload: string, sig: string): boolean {
  try {
    const good = sign(payload);
    return crypto.timingSafeEqual(Buffer.from(good), Buffer.from(sig || ""));
  } catch {
    return false;
  }
}

