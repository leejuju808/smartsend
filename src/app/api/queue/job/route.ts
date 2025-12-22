import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    const u = new URL(req.url);
    const id = u.searchParams.get("id");
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

    const sb = createServiceClient();

    const { data: job, error: jobErr } = await sb
      .from("send_queue_view")
      .select("*")
      .eq("id", id)
      .single();

    if (jobErr || !job) return NextResponse.json({ error: "Job not found" }, { status: 404 });

    const { data: attempts, error: attErr } = await sb
      .from("send_attempt_logs")
      .select("id, attempt_no, status, provider, error_code, error_message, meta, created_at")
      .eq("queue_id", id)
      .order("created_at", { ascending: true });

    if (attErr) return NextResponse.json({ error: attErr.message }, { status: 500 });

    const { data: events } = await sb
      .from("campaign_logs")
      .select("id, event, meta, created_at")
      .or(`lead_id.eq.${job.lead_id},campaign_id.eq.${job.campaign_id}`)
      .order("created_at", { ascending: true })
      .limit(200);

    return NextResponse.json({ job, attempts: attempts ?? [], events: events ?? [] });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Failed to load job" }, { status: 500 });
  }
}


