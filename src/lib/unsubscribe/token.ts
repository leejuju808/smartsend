import crypto from "crypto";

const SECRET = process.env.UNSUBSCRIBE_SECRET!; // set in .env
export type UnsubPayload = { email: string; exp: number }; // exp in epoch seconds

export function signUnsub(payload: UnsubPayload) {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = crypto.createHmac("sha256", SECRET).update(body).digest("base64url");
  return `${body}.${sig}`;
}

export function verifyUnsub(token: string): UnsubPayload | null {
  const [body, sig] = token.split(".");
  const expected = crypto.createHmac("sha256", SECRET).update(body).digest("base64url");
  if (sig !== expected) return null;
  const payload = JSON.parse(Buffer.from(body, "base64url").toString()) as UnsubPayload;
  if (payload.exp < Math.floor(Date.now() / 1000)) return null;
  return payload;
}