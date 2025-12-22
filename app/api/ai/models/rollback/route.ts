import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";

export async function POST() {
  const supabase = createRouteHandlerClient({ cookies });

  const { data: active } = await supabase.from("ai_active_models").select("*").eq("eval_set", "reply_classifier").single();

  if (!active) {
    return Response.json({ error: "no active row" }, { status: 404 });
  }

  const { error } = await supabase
    .from("ai_active_models")
    .update({
      canary_model: null,
      canary_percent: 0,
      updated_at: new Date().toISOString(),
    })
    .eq("eval_set", "reply_classifier");

  if (error) {
    return Response.json({ error }, { status: 400 });
  }

  await supabase.from("ai_model_promotions").insert({
    eval_set: "reply_classifier",
    to_model: active.active_model,
    action: "rollback",
    details: { note: "reset canary to 0%" },
  });

  return Response.json({ ok: true });
}
















