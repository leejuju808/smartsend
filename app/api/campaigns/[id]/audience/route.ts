// app/api/campaigns/[id]/audience/route.ts

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

    if (cErr || !campaign) {
      return NextResponse.json(
        { error: "campaign_not_found", details: cErr?.message },
        { status: 404 }
      );
    }

    let rules: SegmentRuleNode | null = null;

    // 2) Load segment rules if applicable
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

    // 3) Build audience query
    let query = supabase
      .from("leads")
      .select("id", { count: "exact", head: true })
      .eq("account_id", campaign.account_id) as any;

    query = applySegmentFilters(query, rules);

    const { count, error } = await query;

    if (error) {
      return NextResponse.json(
        { error: "audience_count_failed", details: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      campaignId: params.id,
      audience: count ?? 0,
    });
  } catch (err: any) {
    console.error("Campaign audience count error:", err);
    return NextResponse.json(
      {
        error: "internal_error",
        details: err.message || "Unexpected error",
      },
      { status: 500 }
    );
  }
}












