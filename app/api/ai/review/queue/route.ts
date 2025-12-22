import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";

export async function GET() {
  const supabase = createRouteHandlerClient({ cookies });

  const { data, error } = await supabase
    .from("ai_review_queue")
    .select(
      "id,created_at,reason,live_inference_id,status,ai_live_inferences(text_preview,predicted_label,score,threshold)",
    )
    .eq("status", "open")
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) {
    return Response.json({ error }, { status: 400 });
  }

  return Response.json(data);
}
















