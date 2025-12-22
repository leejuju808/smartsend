import crypto from "crypto";

export function makeUnsubLink({
  accountId, leadId, campaignId, emailId
}: { accountId: string; leadId: string; campaignId?: string|null; emailId?: string|null }) {
  const base = `${accountId}.${leadId}.${campaignId || ""}.${emailId || ""}`;
  const sig = crypto.createHmac("sha256", process.env.UNSUB_SECRET!).update(base).digest("hex").slice(0, 24);
  const token = Buffer.from(`${base}.${sig}`).toString("base64url");
  return `${process.env.NEXT_PUBLIC_APP_URL}/u/${token}`;
}

export function verifyUnsubToken(token: string) {
  try {
    const raw = Buffer.from(token, "base64url").toString("utf8");
    const [accountId, leadId, campaignId, emailId, sig] = raw.split(".");
    const base = `${accountId}.${leadId}.${campaignId || ""}.${emailId || ""}`;
    const check = crypto.createHmac("sha256", process.env.UNSUB_SECRET!).update(base).digest("hex").slice(0, 24);
    if (sig !== check) return null;
    return { accountId, leadId, campaignId: campaignId || null, emailId: emailId || null };
  } catch { return null; }
}















