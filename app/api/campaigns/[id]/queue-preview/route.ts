// app/api/campaigns/[id]/queue-preview/route.ts

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient, requireUserAndAccount } from "@/lib/supabase/server";
import type { SegmentRuleNode } from "@/lib/segments/debug";
import { applySegmentFilters } from "@/lib/segments/query-builder";

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = getSupabaseServerClient();
    const { account } = await requireUserAndAccount(supabase);

    const body = await req.json().catch(() => ({}));
    const page = Number(body.page ?? 1);
    const size = Number(body.pageSize ?? 50);

    const offset = (page - 1) * size;

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

    // 2) Load segment (if any)
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

    // 3) Base lead query (include bounced and unsubscribed fields)
    let baseQuery = supabase
      .from("leads")
      .select("id, first_name, last_name, email, company, status, bounced, unsubscribed", {
        count: "exact",
      })
      .eq("account_id", campaign.account_id) as any;

    baseQuery = applySegmentFilters(baseQuery, rules);

    const { data: leads, error: leadErr, count } = await baseQuery
      .range(offset, offset + size - 1);

    if (leadErr) {
      return NextResponse.json(
        { error: "lead_fetch_failed", details: leadErr.message },
        { status: 500 }
      );
    }

    // 4) Load reply + bounce exclusions
    const leadIds = (leads ?? []).map((l) => l.id);
    
    let replied = new Set<string>();
    let bounced = new Set<string>();
    let unsubscribed = new Set<string>();

    if (leadIds.length > 0) {
      // Check for replies - query email_replies table
      // Note: If email_replies doesn't have campaign_id directly, 
      // you may need to join through send_logs or use a different table
      const { data: repliedRows, error: repliedErr } = await supabase
        .from("email_replies")
        .select("lead_id")
        .in("lead_id", leadIds)
        .eq("campaign_id", campaign.id);

      // If campaign_id doesn't exist on email_replies, try through send_logs
      if (repliedErr && repliedErr.code === "42703") {
        // Column doesn't exist, try alternative approach
        const { data: sendLogs } = await supabase
          .from("send_logs")
          .select("id")
          .eq("campaign_id", campaign.id);

        if (sendLogs && sendLogs.length > 0) {
          const sendLogIds = sendLogs.map((sl) => sl.id);
          const { data: repliedRowsAlt } = await supabase
            .from("email_replies")
            .select("lead_id")
            .in("lead_id", leadIds)
            .in("send_log_id", sendLogIds);

          if (repliedRowsAlt) {
            replied = new Set(repliedRowsAlt.map((r) => r.lead_id).filter(Boolean));
          }
        }
      } else if (repliedRows) {
        replied = new Set(repliedRows.map((r) => r.lead_id).filter(Boolean));
      }

      // Check for bounces - query email_bounces table
      const { data: bounceRows, error: bounceErr } = await supabase
        .from("email_bounces")
        .select("lead_id")
        .in("lead_id", leadIds)
        .eq("campaign_id", campaign.id);

      // If campaign_id doesn't exist, check account-wide bounces
      if (bounceErr && bounceErr.code === "42703") {
        const { data: bounceRowsAlt } = await supabase
          .from("email_bounces")
          .select("lead_id")
          .in("lead_id", leadIds)
          .eq("account_id", campaign.account_id);

        if (bounceRowsAlt) {
          bounced = new Set(bounceRowsAlt.map((r) => r.lead_id).filter(Boolean));
        }
      } else if (bounceRows) {
        bounced = new Set(bounceRows.map((r) => r.lead_id).filter(Boolean));
      }

      // Check for unsubscribed leads (from leads table unsubscribed flag or unsubscribes table)
      const { data: unsubRows } = await supabase
        .from("leads")
        .select("id")
        .in("id", leadIds)
        .eq("account_id", campaign.account_id)
        .eq("unsubscribed", true);

      if (unsubRows) {
        unsubscribed = new Set(unsubRows.map((r) => r.id));
      }

      // Also check unsubscribes table for any additional entries
      const { data: unsubTableRows } = await supabase
        .from("unsubscribes")
        .select("lead_id")
        .in("lead_id", leadIds);

      if (unsubTableRows) {
        unsubTableRows.forEach((r) => {
          if (r.lead_id) unsubscribed.add(r.lead_id);
        });
      }
    }

    const list = (leads ?? []).map((l) => {
      let excluded: string | null = null;
      if (replied.has(l.id)) {
        excluded = "replied";
      } else if (l.bounced || bounced.has(l.id)) {
        excluded = "bounced";
      } else if (l.unsubscribed || unsubscribed.has(l.id)) {
        excluded = "unsubscribed";
      }

      return {
        ...l,
        excluded,
      };
    });

    return NextResponse.json({
      total: count ?? 0,
      page,
      pageSize: size,
      leads: list,
    });
  } catch (err: any) {
    console.error("Queue preview error:", err);
    return NextResponse.json(
      {
        error: "internal_error",
        details: err.message || "Unexpected error",
      },
      { status: 500 }
    );
  }
}

