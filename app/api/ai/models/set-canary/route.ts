import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";

export async function POST(req: Request) {
  const { canary_version, percent } = await req.json();
  const supabase = createRouteHandlerClient({ cookies });

  const clampedPercent = Math.max(0, Math.min(100, Number(percent) || 0));

  const { error } = await supabase
    .from("ai_active_models")
    .update({
      canary_model: canary_version,
      canary_percent: clampedPercent,
      updated_at: new Date().toISOString(),
    })
    .eq("eval_set", "reply_classifier");

  if (error) {
    return Response.json({ error }, { status: 400 });
  }

  await supabase.from("ai_model_promotions").insert({
    eval_set: "reply_classifier",
    to_model: canary_version,
    action: "set_canary",
    details: { percent: clampedPercent },
  });

  return Response.json({ ok: true });
}
















