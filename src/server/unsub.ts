import crypto from "crypto";

const SECRET = process.env.UNSUBSCRIBE_SECRET!;
const SITE = process.env.NEXT_PUBLIC_SITE_URL!;

function base64UrlEncode(buffer: Buffer) {
  return buffer
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function sign(input: string) {
  return base64UrlEncode(crypto.createHmac("sha256", SECRET).update(input).digest());
}

export function makeUnsubToken(leadId: string, ownerEmail: string, expSec = 60 * 60 * 24 * 365) {
  const payload = { leadId, ownerEmail, exp: Math.floor(Date.now() / 1000) + expSec };
  const body = base64UrlEncode(Buffer.from(JSON.stringify(payload)));
  const sig = sign(body);
  return `${body}.${sig}`;
}

export function verifyUnsubToken(token: string) {
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  if (sign(body) !== sig) return null;
  const json = Buffer.from(body.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString();
  const payload = JSON.parse(json);
  if (payload.exp < Math.floor(Date.now() / 1000)) return null;
  return payload as { leadId: string; ownerEmail: string; exp: number };
}

export function unsubscribeLink(leadId: string, ownerEmail: string) {
  const token = makeUnsubToken(leadId, ownerEmail);
  return `${SITE}/unsubscribe/token?token=${encodeURIComponent(token)}`;
}

