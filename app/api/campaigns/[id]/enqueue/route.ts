import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import type { NextRequest } from "next/server";

export async function POST(_: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createRouteHandlerClient({ cookies });

  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();

  if (userErr || !user) {
    return new Response("Unauthorized", { status: 401 });
  }

  const { data: ids, error: idsErr } = await supabase
    .from("send_identities")
    .select("id,email,provider,daily_limit,warmup_enabled,warmup_stage,warmup_max_stage,is_active")
    .eq("is_active", true);

  if (idsErr) {
    return new Response(idsErr.message, { status: 500 });
  }

  const { data: targets, error: targetsErr } = await supabase
    .from("campaign_targets")
    .select("lead_id,subject,body,send_window_at")
    .eq("campaign_id", params.id);

  if (targetsErr) {
    return new Response(targetsErr.message, { status: 500 });
  }

  if (!targets?.length || !ids?.length) {
    return new Response("Nothing to enqueue", { status: 400 });
  }

  let idx = 0;
  const nowIso = new Date().toISOString();
  const rows = targets.map((t) => {
    const ident = ids[idx++ % ids.length]!;
    return {
      account_id: user.id,
      campaign_id: params.id,
      identity_id: ident.id,
      lead_id: t.lead_id,
      subject: t.subject ?? "",
      body: t.body ?? "",
      scheduled_at: t.send_window_at ?? nowIso,
      priority: 100,
      status: "queued",
      thread_key: `${params.id}:${t.lead_id}`,
    };
  });

  const { error } = await supabase.from("send_queue").insert(rows);
  if (error) {
    return new Response(error.message, { status: 500 });
  }

  return Response.json({ queued: rows.length });
}
