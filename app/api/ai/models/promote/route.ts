import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";

export async function POST(req: Request) {
  const { candidate_version } = await req.json();
  const supabase = createRouteHandlerClient({ cookies });

  const { data: active } = await supabase.from("ai_active_models").select("*").eq("eval_set", "reply_classifier").single();
  const current = active?.active_model;

  const { data: check } = await supabase.rpc("check_model_gates", {
    _eval_set: "reply_classifier",
    _current: current,
    _candidate: candidate_version,
  });

  if (!check?.ok) {
    return Response.json({ ok: false, check }, { status: 412 });
  }

  const { error: updateError } = await supabase
    .from("ai_active_models")
    .update({
      active_model: candidate_version,
      canary_model: null,
      canary_percent: 0,
      updated_at: new Date().toISOString(),
    })
    .eq("eval_set", "reply_classifier");

  if (updateError) {
    return Response.json({ error: updateError }, { status: 400 });
  }

  await supabase.from("ai_model_registry").update({ status: "active" }).eq("model_version", candidate_version);

  if (current) {
    await supabase.from("ai_model_registry").update({ status: "archived" }).eq("model_version", current);
  }

  await supabase.from("ai_model_promotions").insert({
    eval_set: "reply_classifier",
    from_model: current,
    to_model: candidate_version,
    action: "promote",
  });

  return Response.json({ ok: true, check });
}
















