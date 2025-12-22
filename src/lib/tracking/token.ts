import crypto from "crypto";

const SECRET = process.env.TRACKING_SECRET!;

export type ClickPayload = { email_log_id: string; url: string; exp: number };
export type OpenPayload = { email_log_id: string; exp: number };

export function sign<T extends object>(payload: T): string {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = crypto.createHmac("sha256", SECRET).update(body).digest("base64url");
  return `${body}.${sig}`;
}

export function verify<T = any>(token: string): T | null {
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  
  const expected = crypto.createHmac("sha256", SECRET).update(body).digest("base64url");
  if (sig !== expected) return null;
  
  const payload = JSON.parse(Buffer.from(body, "base64url").toString()) as any;
  if (payload.exp < Math.floor(Date.now() / 1000)) return null;
  
  return payload as T;
} 