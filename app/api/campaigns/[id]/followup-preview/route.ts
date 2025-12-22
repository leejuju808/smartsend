// app/api/campaigns/[id]/followup-preview/route.ts

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient, requireUserAndAccount } from "@/lib/supabase/server";
import type { SegmentRuleNode } from "@/lib/segments/debug";
import { applySegmentFilters } from "@/lib/segments/query-builder";

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = getSupabaseServerClient();
    const { account } = await requireUserAndAccount(supabase);

    // 1) Load campaign
    const { data: campaign, error: cErr } = await supabase
      .from("campaigns")
      .select("*")
      .eq("id", params.id)
      .eq("account_id", account.id)
      .single();

    if (!campaign) {
      return NextResponse.json(
        { error: "campaign_not_found", details: cErr?.message },
        { status: 404 }
      );
    }

    // 2) Load segment rules (if any)
    let rules: SegmentRuleNode | null = null;

    if (campaign.segment_id) {
      const { data: segment, error: sErr } = await supabase
        .from("segments")
        .select("*")
        .eq("id", campaign.segment_id)
        .eq("account_id", campaign.account_id)
        .single();

      if (sErr) {
        return NextResponse.json(
          { error: "segment_lookup_failed", details: sErr.message },
          { status: 500 }
        );
      }

      // Extract rules from either rule jsonb or conditions array
      rules = (segment.rule ?? segment.conditions ?? null) as SegmentRuleNode | null;
    }

    // 3) Fetch all leads in the segment
    let baseQuery = supabase
      .from("leads")
      .select("id")
      .eq("account_id", campaign.account_id) as any;

    baseQuery = applySegmentFilters(baseQuery, rules);

    const { data: leads, error: leadsErr } = await baseQuery;

    if (leadsErr) {
      return NextResponse.json(
        { error: "lead_fetch_failed", details: leadsErr.message },
        { status: 500 }
      );
    }

    // initial recipients = all matched leads
    const step1Count = leads?.length ?? 0;

    // 4) For follow-ups: count leads that have NOT replied yet
    const { data: repliedRows } = await supabase
      .from("email_replies")
      .select("lead_id")
      .eq("campaign_id", params.id);

    const repliedSet = new Set((repliedRows ?? []).map((r) => r.lead_id));

    const nonReplied = (leads ?? []).filter((l) => !repliedSet.has(l.id));
    const followUpCount = nonReplied.length;

    return NextResponse.json({
      campaignId: params.id,
      step1: step1Count,
      nextSteps: followUpCount, // applies to all follow-up steps
    });
  } catch (err: any) {
    console.error("Follow-up preview error:", err);
    return NextResponse.json(
      {
        error: "internal_error",
        details: err.message || "Unexpected error",
      },
      { status: 500 }
    );
  }
}

