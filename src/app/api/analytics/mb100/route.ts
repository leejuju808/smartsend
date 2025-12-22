import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * GET /api/analytics/mb100?workspaceId=uuid&period=30
 * Returns:
 * {
 *   periodDays: number,
 *   totals: { replies: number, meetings: number, mb100: number },
 *   daily: Array<{ date: string, replies: number, meetings: number, mb100: number }>
 * }
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const workspaceId = searchParams.get("workspaceId");
    const period = Math.max(1, Math.min(90, Number(searchParams.get("period") || 30)));

    if (!workspaceId) {
      return NextResponse.json({ error: "workspaceId required" }, { status: 400 });
    }

    const since = new Date();
    since.setDate(since.getDate() - period);

    const supabase = createClient();

    // Fetch reply intents and meetings in the period
    const [{ data: replies, error: rErr }, { data: meetings, error: mErr }] = await Promise.all([
      supabase
        .from("reply_intents")
        .select("created_at,intent")
        .eq("workspace_id", workspaceId)
        .gte("created_at", since.toISOString()),
      supabase
        .from("meetings")
        .select("created_at")
        .eq("workspace_id", workspaceId)
        .gte("created_at", since.toISOString())
    ]);

    if (rErr) return NextResponse.json({ error: rErr.message }, { status: 500 });
    if (mErr) return NextResponse.json({ error: mErr.message }, { status: 500 });

    // Bucket by day
    const dayKey = (d: string) => new Date(d).toISOString().slice(0, 10);
    const days: Record<string, { replies: number; meetings: number }> = {};
    // Initialize all days (so charts don't have gaps)
    for (let i = 0; i < period; i++) {
      const d = new Date();
      d.setDate(d.getDate() - (period - 1 - i));
      days[d.toISOString().slice(0, 10)] = { replies: 0, meetings: 0 };
    }

    (replies || []).forEach((r) => {
      const k = dayKey(r.created_at);
      if (!days[k]) days[k] = { replies: 0, meetings: 0 };
      // Count all replies regardless of sentiment: denominator for MB/100
      days[k].replies += 1;
    });

    (meetings || []).forEach((m) => {
      const k = dayKey(m.created_at);
      if (!days[k]) days[k] = { replies: 0, meetings: 0 };
      days[k].meetings += 1;
    });

    const daily = Object.entries(days).map(([date, v]) => ({
      date,
      replies: v.replies,
      meetings: v.meetings,
      mb100: v.replies > 0 ? Math.round((v.meetings / v.replies) * 10000) / 100 : 0
    }));

    const totalsReplies = daily.reduce((s, d) => s + d.replies, 0);
    const totalsMeetings = daily.reduce((s, d) => s + d.meetings, 0);
    const mb100 = totalsReplies > 0 ? Math.round((totalsMeetings / totalsReplies) * 10000) / 100 : 0;

    return NextResponse.json({
      periodDays: period,
      totals: { replies: totalsReplies, meetings: totalsMeetings, mb100 },
      daily
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? "Unknown error" }, { status: 500 });
  }
}