// app/api/dashboard/workspace-summary/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

type RangeKey = "7d" | "30d" | "90d" | "all";

export async function POST(req: NextRequest) {
  try {
    const supabase = createClient();

    const body = await req.json();
    const workspaceId: string | undefined = body.workspaceId;
    const range: RangeKey = body.range || "all";

    if (!workspaceId) {
      return NextResponse.json(
        { error: "workspaceId is required" },
        { status: 400 }
      );
    }

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json(
        { error: "Not authenticated" },
        { status: 401 }
      );
    }

    // Basic range → date mapping (UTC)
    const now = new Date();
    let from: string | null = null;
    let to: string | null = null;
    const iso = (d: Date) => d.toISOString();

    if (range === "7d") {
      const d = new Date(now);
      d.setDate(d.getDate() - 7);
      from = iso(d);
      to = iso(now);
    } else if (range === "30d") {
      const d = new Date(now);
      d.setDate(d.getDate() - 30);
      from = iso(d);
      to = iso(now);
    } else if (range === "90d") {
      const d = new Date(now);
      d.setDate(d.getDate() - 90);
      from = iso(d);
      to = iso(now);
    } else {
      // "all" -> no date filters
      from = null;
      to = null;
    }

    const { data, error } = await supabase.rpc(
      "get_workspace_summary_for_range",
      {
        p_workspace_id: workspaceId,
        p_from: from,
        p_to: to,
      }
    );

    if (error) {
      console.error("get_workspace_summary_for_range error", error);
      return NextResponse.json(
        { error: "Failed to load workspace summary" },
        { status: 500 }
      );
    }

    const summary = data || {};

    const totalSent = Number(summary.total_sent || 0);
    const totalDelivered = Number(summary.total_delivered || 0);
    const opens = Number(summary.unique_opens || 0);
    const clicks = Number(summary.unique_clicks || 0);
    const replies = Number(summary.unique_replies || 0);
    const bounces = Number(summary.total_bounces || 0);

    const rate = (n: number, d: number) =>
      d > 0 ? n / d : 0;

    const openRate = rate(opens, totalDelivered);
    const clickRate = rate(clicks, totalDelivered);
    const replyRate = rate(replies, totalDelivered);

    return NextResponse.json({
      range,
      total_sent: totalSent,
      total_delivered: totalDelivered,
      unique_opens: opens,
      unique_clicks: clicks,
      unique_replies: replies,
      total_bounces: bounces,
      open_rate: openRate,
      click_rate: clickRate,
      reply_rate: replyRate,
    });
  } catch (err) {
    console.error("workspace-summary error", err);
    return NextResponse.json(
      { error: "Unexpected error loading summary" },
      { status: 500 }
    );
  }
}
































































