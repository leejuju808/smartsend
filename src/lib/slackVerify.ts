import crypto from "crypto";

export function verifySlack(req: Request, bodyText: string) {
  const ts = req.headers.get("x-slack-request-timestamp") || "";
  const sig = req.headers.get("x-slack-signature") || "";
  if (!ts || !sig) return false;
  // replay protection (5 min)
  if (Math.abs(Date.now()/1000 - Number(ts)) > 60 * 5) return false;

  const base = `v0:${ts}:${bodyText}`;
  const hmac = crypto.createHmac("sha256", process.env.SLACK_SIGNING_SECRET!);
  hmac.update(base);
  const mySig = `v0=${hmac.digest("hex")}`;
  try {
    // timing-safe compare
    return crypto.timingSafeEqual(Buffer.from(mySig), Buffer.from(sig));
  } catch {
    return false;
  }
} 