import crypto from "crypto";
import { supabaseAdmin } from "@/lib/supabase/admin";

export function makePixelToken() {
  return crypto.randomBytes(9).toString("base64url");
}

type RegisterArgs = {
  accountId: string;
  campaignId?: string | null;
  leadId?: string | null;
  messageId?: string | null;
  gdprOptOut?: boolean;
  trackEnabled?: boolean;
};

export async function registerPixel({
  accountId,
  campaignId,
  leadId,
  messageId,
  gdprOptOut = false,
  trackEnabled = true,
}: RegisterArgs) {
  const pixel = makePixelToken();

  const { error } = await supabaseAdmin.from("message_pixels").insert({
    pixel,
    account_id: accountId,
    campaign_id: campaignId ?? null,
    lead_id: leadId ?? null,
    message_id: messageId ?? null,
    track_enabled: trackEnabled,
    gdpr_optout: gdprOptOut,
  });

  if (error) {
    throw new Error(`registerPixel failed: ${error.message}`);
  }

  return pixel;
}

export function injectPixel(
  html: string,
  trackingHost: string,
  pixel: string,
  regionNoTrack = false
) {
  if (!trackingHost || !pixel) return html;

  const normalizedHost = trackingHost.replace(/^https?:\/\//i, "");
  const url = new URL(`https://${normalizedHost}/p/${pixel}.gif`);
  if (regionNoTrack) {
    url.searchParams.set("gdpr", "no_track");
  }

  const tag = `<img src="${url.toString()}" width="1" height="1" alt="" style="display:block" />`;

  if (html.includes("</body>")) {
    return html.replace("</body>", `${tag}</body>`);
  }

  return html + tag;
}

