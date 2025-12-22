import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

type FollowupSentRow = {
  id: string;
  thread_id: string | null;
  created_at: string;
};

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const campaignParam = searchParams.get("campaign_id");
    const campaignId = campaignParam && campaignParam.trim().length ? campaignParam : null;

    const now = Date.now();
    const since = new Date(now - 7 * 24 * 60 * 60 * 1000);
    const sinceISO = since.toISOString();

    // A) Totals
    const draftedQuery = supabase
      .from("activity_events")
      .select("id", { count: "exact", head: true })
      .eq("kind", "followup_drafted")
      .gte("created_at", sinceISO);

    const sentQuery = supabase
      .from("activity_events")
      .select("id, thread_id, created_at")
      .eq("kind", "followup_sent")
      .gte("created_at", sinceISO);

    if (campaignId) {
      draftedQuery.eq("campaign_id", campaignId);
      sentQuery.eq("campaign_id", campaignId);
    }

    const [draftedResult, sentResult] = await Promise.all([draftedQuery, sentQuery]);

    if (draftedResult.error || sentResult.error) {
      const error = draftedResult.error ?? sentResult.error;
      return NextResponse.json(
        { error: error?.message ?? "Failed to fetch follow-up metrics" },
        { status: 500 }
      );
    }

    const sentRows: FollowupSentRow[] = (sentResult.data ?? []) as FollowupSentRow[];

    // B) Reply-after-send within 72h
    let repliedWithin = 0;
    if (sentRows.length) {
      const threadIds = Array.from(
        new Set(sentRows.map((row) => row.thread_id).filter((id): id is string => Boolean(id)))
      );

      if (threadIds.length) {
        const earliestSend = sentRows.reduce(
          (min, row) => (row.created_at < min ? row.created_at : min),
          sentRows[0].created_at
        );

        const inboundResult = await supabase
          .from("inbox_messages")
          .select("thread_id, created_at")
          .in("thread_id", threadIds)
          .eq("direction", "inbound")
          .gte("created_at", earliestSend);

        if (inboundResult.error) {
          return NextResponse.json(
            { error: inboundResult.error.message },
            { status: 500 }
          );
        }

        const inboundByThread = new Map<string, { created_at: string }[]>();
        for (const inbound of inboundResult.data ?? []) {
          if (!inbound.thread_id) continue;
          const arr = inboundByThread.get(inbound.thread_id) ?? [];
          arr.push(inbound);
          inboundByThread.set(inbound.thread_id, arr);
        }

        for (const sent of sentRows) {
          if (!sent.thread_id) continue;
          const sentTime = new Date(sent.created_at).getTime();
          const cutoff = sentTime + 72 * 60 * 60 * 1000;
          const inboundMessages = inboundByThread.get(sent.thread_id) ?? [];

          if (
            inboundMessages.some((msg) => {
              const msgTime = new Date(msg.created_at).getTime();
              return msgTime > sentTime && msgTime <= cutoff;
            })
          ) {
            repliedWithin += 1;
          }
        }
      }
    }

    // C) Daily series
    const [dailyDraftsResult, dailySentResult] = await Promise.all([
      supabase.rpc("rpc_count_events_per_day_scoped", {
        p_kind: "followup_drafted",
        p_days: 7,
        p_campaign: campaignId,
      }),
      supabase.rpc("rpc_count_events_per_day_scoped", {
        p_kind: "followup_sent",
        p_days: 7,
        p_campaign: campaignId,
      }),
    ]);

    if (dailyDraftsResult.error || dailySentResult.error) {
      const error = dailyDraftsResult.error ?? dailySentResult.error;
      return NextResponse.json(
        { error: error?.message ?? "Failed to fetch follow-up metrics series" },
        { status: 500 }
      );
    }

    const totalDrafted = draftedResult.count ?? draftedResult.data?.length ?? 0;
    const totalSent = sentRows.length;
    const replyRate = totalSent ? Math.round((repliedWithin / totalSent) * 100) : 0;

    return NextResponse.json({
      drafted_7d: totalDrafted,
      sent_7d: totalSent,
      reply_rate_7d: replyRate,
      daily: {
        drafted: dailyDraftsResult.data ?? [],
        sent: dailySentResult.data ?? [],
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

