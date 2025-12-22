import crypto from "crypto";

/**
 * Creates an HMAC signature for unsubscribe links
 * @param leadId - The lead ID
 * @param campaignId - The campaign ID (can be empty string for global unsubscribe)
 * @returns Hex-encoded HMAC signature
 */
export function createUnsubSig(leadId: string, campaignId: string) {
  const secret = process.env.UNSUB_SECRET;
  if (!secret) {
    throw new Error("UNSUB_SECRET environment variable is not set");
  }
  return crypto
    .createHmac("sha256", secret)
    .update(`${leadId}:${campaignId}`)
    .digest("hex");
}

/**
 * Verifies an HMAC signature for unsubscribe links
 * @param leadId - The lead ID
 * @param campaignId - The campaign ID (can be empty string for global unsubscribe)
 * @param sig - The signature to verify
 * @returns true if signature is valid, false otherwise
 */
export function verifyUnsubSig(
  leadId: string,
  campaignId: string,
  sig: string
) {
  try {
    const good = createUnsubSig(leadId, campaignId);
    // Use timing-safe comparison to prevent timing attacks
    return crypto.timingSafeEqual(Buffer.from(good), Buffer.from(sig));
  } catch {
    return false;
  }
}












