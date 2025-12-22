import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";

export async function POST(req: Request) {
  const body = await req.json();
  const { live_inference_id, label, notes, lock } = body ?? {};

  if (!live_inference_id || !label) {
    return Response.json({ error: "live_inference_id and label are required" }, { status: 400 });
  }

  const supabase = createRouteHandlerClient({ cookies });

  const { data, error } = await supabase.rpc("label_live_inference", {
    _live_id: live_inference_id,
    _label: label,
    _notes: notes ?? null,
    _lock: Boolean(lock),
  });

  if (error) {
    return Response.json({ error }, { status: 400 });
  }

  const { error: assignError } = await supabase
    .from("ai_al_assignments")
    .update({ status: "labeled" })
    .eq("live_id", live_inference_id);

  if (assignError) {
    return Response.json({ error: assignError }, { status: 400 });
  }

  return Response.json({ ok: true, sample_id: data });
}

