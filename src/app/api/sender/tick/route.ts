import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";

const BATCH = 10; // per tick

export async function POST() {
  const supabase = createRouteHandlerClient({ cookies });

  // 1) Pick due items (server role would be better; using auth cookie in admin route)
  const nowIso = new Date().toISOString();
  const { data: due, error: derr } = await supabase
    .from("v_send_queue_guarded")
    .select("id,thread_id,user_id,campaign_id,account_id,lead_id,scheduled_at,status,step_no")
    .lte("scheduled_at", nowIso)
    .eq("status", "queued")
    .order("scheduled_at", { ascending: true })
    .limit(BATCH);
  if (derr) return NextResponse.json({ error: derr.message }, { status: 400 });
  if (!due || due.length === 0) return NextResponse.json({ ok: true, sent: 0 });

  const ids = due.map(d => d.id);

  // 2) Claim
  const { error: uerr } = await supabase
    .from("send_queue")
    .update({ status: "sending", updated_at: new Date().toISOString() })
    .in("id", ids);
  if (uerr) return NextResponse.json({ error: uerr.message }, { status: 400 });

  // 3) Pre-flight guard (fn_send_email_guarded will raise if blocked)
  const guardFails: string[] = [];
  for (const job of due) {
    if (!job.thread_id) continue;
    const { error: guardError } = await supabase.rpc("fn_send_email_guarded", {
      p_thread_id: job.thread_id,
      p_payload: {},
    });
    if (guardError) {
      guardFails.push(job.id);
    }
  }

  if (guardFails.length) {
    await supabase
      .from("send_queue")
      .update({ status: "queued", updated_at: new Date().toISOString() })
      .in("id", guardFails);
  }

  const approved = due.filter(d => !guardFails.includes(d.id));
  if (approved.length === 0) {
    return NextResponse.json({ ok: true, sent: 0, skipped: guardFails.length });
  }

  const approvedIds = approved.map(d => d.id);

  // 4) Send (stub)
  // TODO: integrate provider send via Edge Function (gmail/outlook) and return provider_id
  const providerId = "stub-" + Date.now();

  // 5) Mark sent + log
  const { error: serr } = await supabase
    .from("send_queue")
    .update({ status: "sent", updated_at: new Date().toISOString() })
    .in("id", approvedIds);
  if (serr) return NextResponse.json({ error: serr.message }, { status: 400 });

  const logs = approved.map(d => ({
    queue_id: d.id,
    campaign_id: d.campaign_id,
    account_id: d.account_id,
    lead_id: d.lead_id,
    status: "sent",
    provider_id: providerId,
    step_no: (d as any).step_no ?? 1,
    meta: {}
  }));
  const { error: lerr } = await supabase.from("send_logs").insert(logs);
  if (lerr) return NextResponse.json({ error: lerr.message }, { status: 400 });

  return NextResponse.json({ ok: true, sent: approved.length, skipped: guardFails.length });
}

