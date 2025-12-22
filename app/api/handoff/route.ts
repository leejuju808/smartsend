// Manual Handoff API Route
// Handles manual handoff requests from UI

import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import { initiateHandoff } from "@/lib/handoff/engine";
import type { HandoffPayload } from "@/lib/handoff/types";

export async function POST(req: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    
    // Verify authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { threadId } = await req.json();
    if (!threadId) {
      return NextResponse.json({ error: "threadId is required" }, { status: 400 });
    }

    // Fetch thread with related data
    const { data: thread, error: threadError } = await supabase
      .from("reply_threads")
      .select(`
        *,
        leads:lead_id (
          id,
          name,
          email
        ),
        companies:company_id (
          id,
          name
        ),
        campaigns:campaign_id (
          id,
          handoff_mode,
          handoff_destination,
          account_id
        )
      `)
      .eq("id", threadId)
      .single();

    if (threadError || !thread) {
      return NextResponse.json(
        { error: "Thread not found" },
        { status: 404 }
      );
    }

    // Check if campaign has handoff configured
    const campaign = thread.campaigns as any;
    if (!campaign || !campaign.handoff_destination || campaign.handoff_destination === 'none') {
      return NextResponse.json(
        { error: "Handoff not configured for this campaign" },
        { status: 400 }
      );
    }

    // Build handoff payload
    const lead = thread.leads as any;
    const company = thread.companies as any;
    
    const payload: HandoffPayload = {
      lead_name: lead?.name || "Unknown",
      lead_email: lead?.email || "",
      company: company?.name,
      summary: thread.ai_summary || undefined,
      tone: thread.ai_tone || undefined,
      opportunity: thread.ai_opportunity_score || undefined,
      objections: thread.ai_objections || undefined,
      buyer_role: thread.ai_buyer_role || undefined,
      campaign_id: thread.campaign_id || undefined,
      lead_id: thread.lead_id,
      company_id: thread.company_id || undefined
    };

    // Initiate handoff
    const handoffResult = await initiateHandoff(payload, campaign.handoff_destination);

    // Log handoff attempt
    await supabase.from("handoff_logs").insert({
      account_id: campaign.account_id || thread.account_id,
      lead_id: thread.lead_id,
      company_id: thread.company_id || null,
      campaign_id: thread.campaign_id || null,
      method: campaign.handoff_destination,
      status: handoffResult.status === 'success' ? 'success' : 
              handoffResult.status === 'failed' ? 'failed' : 'ignored',
      meta: {
        result: handoffResult,
        payload: payload
      }
    });

    // Log activity
    await supabase.from("activity_log").insert({
      account_id: campaign.account_id || thread.account_id,
      campaign_id: thread.campaign_id || null,
      company_id: thread.company_id || null,
      lead_id: thread.lead_id,
      event_type: handoffResult.status === 'success' ? 'handoff_success' : 
                  handoffResult.status === 'failed' ? 'handoff_failed' : 'handoff_initiated',
      meta: {
        destination: campaign.handoff_destination,
        result: handoffResult
      }
    });

    return NextResponse.json({
      ok: true,
      handoff: handoffResult
    });
  } catch (error: any) {
    console.error("Handoff error:", error);
    return NextResponse.json(
      { error: error?.message || "Internal server error" },
      { status: 500 }
    );
  }
}












