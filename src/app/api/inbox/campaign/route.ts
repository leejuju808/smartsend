import { createClient } from "@supabase/supabase-js";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const campaign = url.searchParams.get("campaign")!;
  const q = (url.searchParams.get("q") || "").toLowerCase();
  const label = url.searchParams.get("label") || "all";

  const supabase = createRouteHandlerClient({ cookies });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 });

  // Pull threads with last inbound label and join lead + last subject
  let { data: base, error } = await supabase
    .from("inbox_threads")
    .select("id, campaign_id, lead_id, subject, updated_at, replied_at, stopped_by_reply")
    .eq("campaign_id", campaign)
    .order("updated_at", { ascending: false })
    .limit(200);

  if (error) return new Response(JSON.stringify({ error: String(error) }), { status: 500 });

  const threadIds = base?.map(b => b.id) ?? [];
  const { data: last } = await supabase
    .from("v_thread_last_inbound")
    .select("thread_id,last_inbound_at,last_label,last_confidence")
    .in("thread_id", threadIds);

  const lastMap = new Map((last ?? []).map(l => [l.thread_id, l]));
  // Optionally fetch lead emails
  const { data: leads } = await supabase.from("leads").select("id,email").in("id", base?.map(b=>b.lead_id).filter(Boolean) ?? []);
  const emailMap = new Map((leads ?? []).map(l => [l.id, l.email]));

  // Filter client-side (for simplicity)
  let rows = (base ?? []).map(b => ({
    thread_id: b.id,
    subject: b.subject,
    updated_at: b.updated_at,
    stopped_by_reply: b.stopped_by_reply,
    last_inbound_at: lastMap.get(b.id)?.last_inbound_at ?? null,
    last_label: lastMap.get(b.id)?.last_label ?? null,
    lead_email: emailMap.get(b.lead_id) ?? null
  }));

  if (label !== "all") rows = rows.filter(r => r.last_label === label);
  if (q) {
    const ql = q.toLowerCase();
    rows = rows.filter(r =>
      (r.lead_email || "").toLowerCase().includes(ql) ||
      (r.subject || "").toLowerCase().includes(ql)
    );
  }

  return new Response(JSON.stringify({ rows }), { headers: { "content-type":"application/json" } });
}

