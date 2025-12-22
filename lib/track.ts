import crypto from "crypto";

const SECRET = process.env.TRACKING_HMAC_SECRET;

if (!SECRET) {
  throw new Error("TRACKING_HMAC_SECRET is not set");
}

export type TrackPayload = {
  l: string;               // send_logs.id (uuid)
  c: string;               // campaign_id (uuid)
  s?: number | null;       // step_no
  v?: string | null;       // variant_id (uuid)
  u?: string | null;       // (click) destination URL
};

function sign(data: string) {
  const mac = crypto.createHmac("sha256", SECRET).update(data).digest("base64url");
  return mac;
}

export function encodeToken(p: TrackPayload) {
  const data = Buffer.from(JSON.stringify(p)).toString("base64url");
  return `${data}.${sign(data)}`;
}

export function decodeToken(t: string): TrackPayload | null {
  const [data, mac] = t.split(".");
  if (!data || !mac) return null;
  const expected = sign(data);
  try {
    if (!crypto.timingSafeEqual(Buffer.from(mac), Buffer.from(expected))) return null;
  } catch {
    return null;
  }
  try {
    return JSON.parse(Buffer.from(data, "base64url").toString("utf8"));
  } catch {
    return null;
  }
}

