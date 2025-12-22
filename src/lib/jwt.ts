import crypto from "crypto";

const SECRET = process.env.UNSUBSCRIBE_SECRET || "change-me";

function b64url(buf: Buffer) {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/,"");
}

export function sign(payload: Record<string, any>) {
  const header = b64url(Buffer.from(JSON.stringify({ alg:"HS256", typ:"JWT" })));
  const body = b64url(Buffer.from(JSON.stringify(payload)));
  const data = `${header}.${body}`;
  const sig = crypto.createHmac("sha256", SECRET).update(data).digest();
  return `${data}.${b64url(sig)}`;
}

export function verify<T=any>(token: string): T | null {
  const [h,b,sig] = token.split(".");
  if (!h || !b || !sig) return null;
  const data = `${h}.${b}`;
  const check = b64url(crypto.createHmac("sha256", SECRET).update(data).digest());
  if (check !== sig) return null;
  const payload = JSON.parse(Buffer.from(b,"base64").toString("utf8")) as any;
  if (payload.exp && Date.now() > payload.exp*1000) return null;
  return payload as T;
}