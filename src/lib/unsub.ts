import crypto from "crypto";

let cachedSecret: string | null = null;

function getSecret() {
  if (cachedSecret) return cachedSecret;
  const secret = process.env.UNSUBSCRIBE_HMAC_SECRET ?? process.env.UNSUBSCRIBE_SECRET;
  if (!secret) {
    throw new Error("UNSUBSCRIBE_HMAC_SECRET (or UNSUBSCRIBE_SECRET) must be configured");
  }
  cachedSecret = secret;
  return cachedSecret;
}

export type UnsubSignaturePayload = {
  c: string; // campaign_id
  e: string; // recipient email
  r?: string | null; // optional reason hint
};

const APP_BASE_URL = (process.env.NEXT_PUBLIC_APP_URL
  || process.env.NEXT_PUBLIC_SITE_URL
  || process.env.NEXT_PUBLIC_BASE_URL
  || "https://app.smartsendhq.com").replace(/\/$/, "");

export function signUnsub(payload: UnsubSignaturePayload) {
  const data = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const mac = crypto.createHmac("sha256", getSecret()).update(data).digest("base64url");
  return `${data}.${mac}`;
}

export function verifyUnsubToken(token: string) {
  const [data, mac] = token.split(".");
  if (!data || !mac) return null;

  const expected = crypto.createHmac("sha256", getSecret()).update(data).digest("base64url");
  const macBuf = Buffer.from(mac, "base64url");
  const expectedBuf = Buffer.from(expected, "base64url");
  if (macBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(macBuf, expectedBuf)) {
    return null;
  }

  try {
    const obj = JSON.parse(Buffer.from(data, "base64url").toString("utf8")) as UnsubSignaturePayload;
    if (!obj?.c || !obj?.e) return null;
    return obj;
  } catch {
    return null;
  }
}

export function buildUnsubHeaders(campaignId: string, toEmail: string, reason?: string | null) {
  const token = signUnsub({ c: campaignId, e: toEmail, r: reason ?? null });
  const encodedEmail = Buffer.from(toEmail.toLowerCase(), "utf8").toString("base64");
  const oneClickUrl = `${APP_BASE_URL}/api/unsub?e=${encodeURIComponent(encodedEmail)}&t=${encodeURIComponent(token)}`;
  const mailto = `mailto:unsubscribe@smartsendhq.com?subject=${encodeURIComponent(campaignId)}`;
  return {
    "List-Unsubscribe": `<${mailto}>, <${oneClickUrl}>`,
    "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
  } as Record<string, string>;
}

export function renderFooter(campaignId: string, toEmail: string, reason?: string | null) {
  const token = signUnsub({ c: campaignId, e: toEmail, r: reason ?? null });
  const encodedEmail = Buffer.from(toEmail.toLowerCase(), "utf8").toString("base64");
  const url = `${APP_BASE_URL}/api/unsub?e=${encodeURIComponent(encodedEmail)}&t=${encodeURIComponent(token)}`;
  return `<div style="margin-top:24px;color:#6b7280;font-size:12px">
    Don't want these? <a href="${url}">Unsubscribe</a>.
  </div>`;
}

// ---------------------------------------------------------------------------
// Legacy helpers (kept for backwards compatibility)
// ---------------------------------------------------------------------------

export function makeUnsubToken(campaignId: string, email: string, reason?: string | null) {
  return signUnsub({ c: campaignId, e: email, r: reason ?? null });
}

export function parseUnsubToken(token: string) {
  const payload = verifyUnsubToken(token);
  if (!payload) throw new Error("Invalid unsubscribe token");
  return payload;
}
