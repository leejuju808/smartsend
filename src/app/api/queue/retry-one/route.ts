import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function sbAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}

export async function POST(req: NextRequest) {
  try {
    const { queue_id, scheduled_at } = (await req.json()) as {
      queue_id: string;                 // failed row id
      scheduled_at?: string;            // optional ISO time for new attempt
    };
    
    if (!queue_id) {
      return NextResponse.json({ ok: false, error: "queue_id required" }, { status: 400 });
    }

    const supabase = sbAdmin();

    // 1) Load the failed row
    const { data: row, error: e1 } = await supabase
      .from("send_queue")
      .select("id, campaign_id, lead_id, email_template_id, workspace_id, status")
      .eq("id", queue_id)
      .single();
      
    if (e1) throw e1;
    if (!row) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
    if (row.status !== "failed") {
      return NextResponse.json({ ok: false, error: "Only failed items can be retried" }, { status: 400 });
    }

    // 2) Insert a fresh queued attempt
    const sched = scheduled_at ?? new Date().toISOString();
    const insertPayload: any = {
      workspace_id: row.workspace_id,
      campaign_id: row.campaign_id,
      lead_id: row.lead_id,
      email_template_id: row.email_template_id,
      scheduled_at: sched,
      status: "pending", // or 'queued' depending on your schema
    };

    const { data: newRows, error: e2 } = await supabase
      .from("send_queue")
      .insert(insertPayload)
      .select("id, lead_id")
      .limit(1);
      
    if (e2) throw e2;

    const newId = newRows?.[0]?.id as string;

    return NextResponse.json({ ok: true, new_queue_id: newId, scheduled_at: sched });
  } catch (e: any) {
    console.error("Retry one error:", e);
    return NextResponse.json({ ok: false, error: e.message ?? "Unknown error" }, { status: 500 });
  }
}

export const runtime = 'nodejs';