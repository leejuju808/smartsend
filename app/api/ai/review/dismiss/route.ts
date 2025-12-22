import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";

export async function POST(req: Request) {
  const body = await req.json();
  const { live_inference_id } = body ?? {};

  if (!live_inference_id) {
    return Response.json({ error: "live_inference_id is required" }, { status: 400 });
  }

  const supabase = createRouteHandlerClient({ cookies });

  const { error } = await supabase
    .from("ai_review_queue")
    .update({ status: "dismissed" })
    .eq("live_inference_id", live_inference_id)
    .eq("status", "open");

  if (error) {
    return Response.json({ error }, { status: 400 });
  }

  const { error: assignError } = await supabase
    .from("ai_al_assignments")
    .update({ status: "dismissed" })
    .eq("live_id", live_inference_id)
    .eq("status", "open");

  if (assignError) {
    return Response.json({ error: assignError }, { status: 400 });
  }

  return Response.json({ ok: true });
}

