import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function GET(req: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    return NextResponse.json(
      { error: "Supabase credentials not configured" },
      { status: 500 }
    );
  }

  const supabase = createClient(url, key, { auth: { persistSession: false } });

  const searchParams = new URL(req.url).searchParams;
  const limit = Number(searchParams.get("limit") ?? 200);

  const { data: rows, error } = await supabase
    .from("v_inbox_state")
    .select(
      `
        thread_id,
        subject,
        last_message_preview,
        snoozed_until,
        updated_at,
        campaign_id,
        label,
        confidence,
        labeled_at,
        resume_after,
        has_active_ooo
      `
    )
    .order("updated_at", { ascending: false })
    .limit(limit);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const threadIds = (rows ?? []).map((row: any) => row.thread_id).filter(Boolean);
  let previewMap = new Map<string, string>();

  if (threadIds.length) {
    const { data: events } = await supabase
      .from("delivery_events")
      .select("thread_id, event, meta, created_at")
      .in("thread_id", threadIds)
      .in("event", ["ooo_detected", "reply_detected"])
      .order("created_at", { ascending: false });

    previewMap = new Map<string, string>();
    for (const evt of events ?? []) {
      const threadId = evt.thread_id as string | null;
      if (!threadId || previewMap.has(threadId)) continue;
      const meta = evt.meta as any;
      const clean =
        typeof meta?.clean_preview === "string" && meta.clean_preview.trim().length
          ? (meta.clean_preview as string)
          : null;
      const fallback =
        typeof meta?.preview === "string" && meta.preview.trim().length
          ? (meta.preview as string)
          : null;
      if (clean || fallback) {
        previewMap.set(threadId, clean ?? fallback ?? "");
      }
    }
  }

  const mapped = (rows ?? []).map((row: any) => ({
    threadId: row.thread_id,
    subject: row.subject,
    preview: row.last_message_preview,
    snoozedUntil: row.snoozed_until,
    label: row.label ?? null,
    confidence: row.confidence ?? null,
    labeledAt: row.labeled_at ?? null,
    hasActiveOOO: Boolean(row.has_active_ooo),
    resumeAfter: row.resume_after ?? null,
    updatedAt: row.updated_at,
    campaignId: row.campaign_id,
    oooPreview: previewMap.get(row.thread_id) ?? null,
  }));

  return NextResponse.json({ items: mapped });
}