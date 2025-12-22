import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { blockIfAutopilotEnabled } from "@/lib/autopilot/guard";

export async function POST(request: NextRequest) {
  try {
    // Verify authentication
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Parse request body (support both campaign_id and id)
    const body = await request.json();
    const campaign_id = body.id || body.campaign_id;
    const reason = String(body?.reason || "").trim();
    
    if (!campaign_id) {
      return NextResponse.json(
        { error: 'Missing campaign id' },
        { status: 400 }
      );
    }

    // BLOCK 269600 — SmartSend Enforcement Sprint:
    // Pausing requires a reason.
    const allowedPauseReasons = [
      "deliverability_issue",
      "no_leads",
      "seasonal_break",
      "vacation",
      "other",
    ] as const;
    if (!allowedPauseReasons.includes(reason as any)) {
      return NextResponse.json({ error: "pause reason required" }, { status: 400 });
    }

    // BLOCK 273000 — AUTOPILOT: owner cannot pause campaigns.
    // Look up workspace_id from campaign.
    const { data: campRow } = await supabase
      .from("campaigns")
      .select("workspace_id")
      .eq("id", campaign_id)
      .maybeSingle();
    const workspaceId = String((campRow as any)?.workspace_id || "");
    if (workspaceId) {
      const gate = await blockIfAutopilotEnabled({
        req: request,
        workspaceId,
        action: "Pause campaign",
      });
      if (gate.blocked) return gate.response;
    }

    // Prefer canonical guard RPC (handles schema differences).
    const { error: rpcErr } = await supabase.rpc("guard_pause_campaign", {
      p_campaign: campaign_id,
      p_reason: reason,
    });

    // Fallback: update status fields (older codepaths)
    const { error: updateError } = rpcErr
      ? await supabase
          .from("campaigns")
          .update({
            status: "Paused",
            pause_reason: reason,
            updated_at: new Date().toISOString(),
          })
          .eq("id", campaign_id)
      : { error: null };

    if (updateError) {
      console.error('Error pausing campaign:', updateError);
      if (String((updateError as any)?.message || "").includes("System performance indicates continuation")) {
        return NextResponse.json({ error: "System performance indicates continuation." }, { status: 423 });
      }
      return NextResponse.json(
        { error: 'Failed to pause campaign' },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Campaign pause error:', error);
    return NextResponse.json(
      { error: 'Failed to pause campaign' },
      { status: 500 }
    );
  }
} 