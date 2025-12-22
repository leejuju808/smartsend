import crypto from "crypto";

export function pickRoute(leadIdOrEmail: string, canaryWeight: number, hashSalt: string) {
  const h = crypto.createHash("sha1").update(`${hashSalt}|${leadIdOrEmail}`).digest("hex").slice(0, 8);
  const val = parseInt(h, 16) % 100;
  return val < canaryWeight ? "canary" : "current";
}



















