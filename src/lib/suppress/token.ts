import crypto from "crypto";

const SECRET = process.env.SUPPRESSION_SECRET!;
if (!SECRET) throw new Error("SUPPRESSION_SECRET missing");

export type UnsubPayload = {
  u: string;    // user_id
  e: string;    // email
  c?: string;   // optional campaign_id
  ts: number;   // issued at (ms)
};

function b64url(buf: Buffer) {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function ub64url(s: string) {
  s = s.replace(/-/g, "+").replace(/_/g, "/");
  while (s.length % 4) s += "=";
  return Buffer.from(s, "base64");
}

export function signUnsub(payload: Omit<UnsubPayload, "ts">): string {
  const full: UnsubPayload = { ...payload, ts: Date.now() };
  const data = Buffer.from(JSON.stringify(full));
  const h = crypto.createHmac("sha256", SECRET).update(data).digest();
  return `${b64url(data)}.${b64url(h)}`;
}

export function verifyUnsub(token: string): UnsubPayload | null {
  const [p, sig] = token.split(".");
  if (!p || !sig) return null;
  
  try {
    const data = ub64url(p);
    const expected = crypto.createHmac("sha256", SECRET).update(data).digest();
    const ok = crypto.timingSafeEqual(expected, ub64url(sig));
    if (!ok) return null;
    
    const parsed = JSON.parse(data.toString()) as UnsubPayload;
    // Optional: add expiry check here if needed
    // const age = Date.now() - parsed.ts;
    // if (age > 3 * 365 * 24 * 60 * 60 * 1000) return null; // 3 years
    return parsed;
  } catch {
    return null;
  }
}
