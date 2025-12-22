import crypto from "crypto";

function b64u(buf: Buffer) {
  return buf.toString("base64").replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
}

function ub64u(str: string) {
  str = str.replace(/-/g,"+").replace(/_/g,"/");
  return Buffer.from(str + "=".repeat((4 - (str.length % 4)) % 4), "base64");
}

export function signUnsubToken(user_id: string, email: string) {
  const secret = process.env.SMARTSEND_UNSUB_SECRET!;
  const payload = JSON.stringify({ u: user_id, e: email.toLowerCase().trim() });
  const p = b64u(Buffer.from(payload));
  const sig = b64u(crypto.createHmac("sha256", secret).update(p).digest());
  return `${p}.${sig}`;
}

export function verifyUnsubToken(token: string): { user_id: string; email: string } | null {
  try {
    const [p, sig] = token.split(".");
    if (!p || !sig) return null;
    const expected = signSig(p);
    if (!timingSafeEq(sig, expected)) return null;
    const { u, e } = JSON.parse(ub64u(p).toString("utf8"));
    if (!u || !e) return null;
    return { user_id: String(u), email: String(e) };
  } catch { return null; }

  function signSig(p: string) {
    const secret = process.env.SMARTSEND_UNSUB_SECRET!;
    return b64u(crypto.createHmac("sha256", secret).update(p).digest());
  }
  
  function timingSafeEq(a: string, b: string) {
    const aa = Buffer.from(a), bb = Buffer.from(b);
    if (aa.length !== bb.length) return false;
    return crypto.timingSafeEqual(aa, bb);
  }
}