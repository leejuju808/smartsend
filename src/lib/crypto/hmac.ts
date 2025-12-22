import crypto from "crypto";

/**
 * Get the unsubscribe secret from environment variables
 * Falls back to UNSUB_SECRET or SMARTSEND_UNSUB_SECRET
 */
function getUnsubSecret(): string {
  const secret = process.env.UNSUB_SECRET || process.env.SMARTSEND_UNSUB_SECRET;
  if (!secret) {
    throw new Error("UNSUB_SECRET or SMARTSEND_UNSUB_SECRET environment variable is required");
  }
  return secret;
}

/**
 * Create HMAC signature for tracking URLs (open/click)
 * Uses the same UNSUB_SECRET as the unsubscribe system
 * 
 * @param leadId - Lead UUID
 * @param campaignId - Campaign UUID
 * @returns Base64url-encoded HMAC signature
 */
export function createUnsubSig(leadId: string, campaignId: string): string {
  const secret = getUnsubSecret();
  const base = `${leadId}.${campaignId}`;
  const hmac = crypto.createHmac("sha256", secret).update(base).digest("base64url");
  return hmac;
}

/**
 * Verify HMAC signature for tracking URLs
 * 
 * @param leadId - Lead UUID
 * @param campaignId - Campaign UUID
 * @param sig - Signature to verify (base64url-encoded)
 * @returns true if signature is valid, false otherwise
 */
export function verifyUnsubSig(leadId: string, campaignId: string, sig: string): boolean {
  try {
    const secret = getUnsubSecret();
    const base = `${leadId}.${campaignId}`;
    const expected = crypto.createHmac("sha256", secret).update(base).digest("base64url");
    
    // Use timing-safe comparison to prevent timing attacks
    const sigBuf = Buffer.from(sig, "base64url");
    const expectedBuf = Buffer.from(expected, "base64url");
    
    if (sigBuf.length !== expectedBuf.length) {
      return false;
    }
    
    return crypto.timingSafeEqual(sigBuf, expectedBuf);
  } catch {
    return false;
  }
}












