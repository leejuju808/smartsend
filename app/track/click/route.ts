// app/track/click/route.ts

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { verifyUnsubSig } from "@/lib/crypto/hmac";
import type { Database } from "@/lib/supabase/types";
import { updateLeadScore } from "@/lib/lead-scoring";

const supabase = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(req: NextRequest) {
  const url = new URL(req.url);

  const raw = url.searchParams.get("u");
  const leadId = url.searchParams.get("l");
  const campaignId = url.searchParams.get("c");
  const sig = url.searchParams.get("sig");

  // Default safe redirect if validation fails
  if (!raw || !leadId || !campaignId || !sig) {
    return NextResponse.redirect("https://google.com");
  }

  // Verify HMAC signature
  if (!verifyUnsubSig(leadId, campaignId, sig)) {
    return NextResponse.redirect("https://google.com");
  }

  const dest = decodeURIComponent(raw);

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

  // Record click event (fire and forget - don't block redirect)
  supabase.from("email_events").insert({
    campaign_id: campaignId,
    lead_id: leadId,
    event_type: "click",
    url: dest,
    ip: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
    ua: req.headers.get("user-agent") ?? null,
  }).catch((err) => {
    console.error("Failed to record click event:", err);
  });

  // Update lead score (fire and forget)
  if (leadId) {
    updateLeadScore(leadId, "click", workspaceId);
  }

  return NextResponse.redirect(dest);
}





