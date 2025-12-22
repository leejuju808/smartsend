// Block 8620 — First-Time Onboarding Checklist
// GET /api/onboarding/status - Returns onboarding status for the logged-in user

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

type OnboardingStatus = {
  has_sending_settings: boolean;
  has_campaign: boolean;
  has_leads: boolean;
  has_outbound_activity: boolean;
};

export async function GET(req: NextRequest) {
  const supabase = createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    const empty: OnboardingStatus = {
      has_sending_settings: false,
      has_campaign: false,
      has_leads: false,
      has_outbound_activity: false,
    };
    return NextResponse.json(empty, { status: 200 });
  }

  const ownerId = user.id;

  // Get user's workspace membership to check leads
  const { data: membership } = await supabase
    .from("workspace_members")
    .select("workspace_id")
    .eq("user_id", ownerId)
    .limit(1)
    .maybeSingle();

  const workspaceId = membership?.workspace_id;

  // 1. Check sending settings
  const { data: settingsRow } = await supabase
    .from("workspace_sending_settings")
    .select("id")
    .eq("owner_id", ownerId)
    .maybeSingle();

  const hasSendingSettings = !!settingsRow;

  // 2. Check campaigns (by owner_id or created_by, within workspace if available)
  let hasCampaign = false;
  if (workspaceId) {
    const { count: campaignCount } = await supabase
      .from("campaigns")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", workspaceId)
      .or(`owner_id.eq.${ownerId},created_by.eq.${ownerId}`);
    
    hasCampaign = (campaignCount ?? 0) > 0;
  } else {
    // Fallback: check by owner_id or created_by without workspace filter
    const { count: campaignCount } = await supabase
      .from("campaigns")
      .select("id", { count: "exact", head: true })
      .or(`owner_id.eq.${ownerId},created_by.eq.${ownerId}`);
    
    hasCampaign = (campaignCount ?? 0) > 0;
  }

  // 3. Check leads (by workspace_id)
  let hasLeads = false;
  if (workspaceId) {
    const { count: leadCount } = await supabase
      .from("leads")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", workspaceId);

    hasLeads = (leadCount ?? 0) > 0;
  }

  // 4. Check outbound activity (queued or sent)
  // Check by owner_id, or by workspace_id if owner_id not set
  let hasOutboundActivity = false;
  
  // First try by owner_id
  const { count: outboundCountByOwner } = await supabase
    .from("outbound_emails")
    .select("id", { count: "exact", head: true })
    .eq("owner_id", ownerId)
    .in("status", ["pending", "sent"]);
  
  if ((outboundCountByOwner ?? 0) > 0) {
    hasOutboundActivity = true;
  } else if (workspaceId) {
    // Fallback: check by workspace_id
    const { count: outboundCountByWorkspace } = await supabase
      .from("outbound_emails")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", workspaceId)
      .in("status", ["pending", "sent"]);
    
    hasOutboundActivity = (outboundCountByWorkspace ?? 0) > 0;
  }

  const status: OnboardingStatus = {
    has_sending_settings: hasSendingSettings,
    has_campaign: hasCampaign,
    has_leads: hasLeads,
    has_outbound_activity: hasOutboundActivity,
  };

  return NextResponse.json(status, { status: 200 });
}
