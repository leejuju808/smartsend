// app/track/open/route.ts

import { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { verifyUnsubSig } from "@/lib/crypto/hmac";
import type { Database } from "@/lib/supabase/types";
import { updateLeadScore } from "@/lib/lead-scoring";

const supabase = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// returns a 1x1 transparent gif
const pixel = Buffer.from(
  "R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==",
  "base64"
);

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const leadId = url.searchParams.get("l");
  const campaignId = url.searchParams.get("c");
  const sig = url.searchParams.get("sig");

  // Always return pixel, even if validation fails (to prevent tracking detection)
  if (!leadId || !campaignId || !sig) {
    return new Response(pixel, {
      headers: { "Content-Type": "image/gif" },
    });
  }

  // Verify HMAC signature
  if (!verifyUnsubSig(leadId, campaignId, sig)) {
    return new Response(pixel, {
      headers: { "Content-Type": "image/gif" },
    });
  }

  // Get workspace_id from lead
  let workspaceId: string | undefined;
  const { data: lead } = await supabase
    .from("leads")
    .select("workspace_id")
    .eq("id", leadId)
    .single();
  if (lead) {
    workspaceId = lead.workspace_id;
  }

  // Record open event (fire and forget - don't block response)
  supabase.from("email_events").insert({
    campaign_id: campaignId,
    lead_id: leadId,
    event_type: "open",
    ip: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
    ua: req.headers.get("user-agent") ?? null,
  }).catch((err) => {
    console.error("Failed to record open event:", err);
  });

  // Update lead score (fire and forget)
  if (leadId) {
    updateLeadScore(leadId, "open", workspaceId);
  }

  return new Response(pixel, {
    headers: {
      "Content-Type": "image/gif",
      "Cache-Control": "no-store",
    },
  });
}





