import crypto from "crypto";

const base = process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_VERCEL_URL 
  ? `https://${process.env.NEXT_PUBLIC_VERCEL_URL}` 
  : "http://localhost:3000";
const secret = process.env.TRACKING_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || "fallback-secret";

function sign(payload: string): string {
  return crypto.createHmac("sha256", secret).update(payload).digest("hex");
}

export function openPixelUrl(sendLogId: string, email: string): string {
  const payload = `open:${sendLogId}:${email.toLowerCase()}`;
  const tk = sign(payload);
  return `${base}/t/o?sl=${encodeURIComponent(sendLogId)}&em=${encodeURIComponent(email)}&tk=${tk}`;
}

export function clickUrl(sendLogId: string, dest: string): string {
  const payload = `click:${sendLogId}:${dest}`;
  const tk = sign(payload);
  return `${base}/t/c?sl=${encodeURIComponent(sendLogId)}&u=${encodeURIComponent(dest)}&tk=${tk}`;
}

export function unsubToken(campaignId: string, email: string): string {
  return sign(`unsub:${campaignId}:${email.toLowerCase()}`);
}

import {
  ensureToken as ensureTokenImpl,
  rewriteLinksForTracking as rewriteLinksForTrackingImpl,
  appendOpenPixel as appendOpenPixelImpl,
} from "../../lib/tracking";

export const ensureToken = ensureTokenImpl;
export const rewriteLinksForTracking = rewriteLinksForTrackingImpl;
export const appendOpenPixel = appendOpenPixelImpl;
