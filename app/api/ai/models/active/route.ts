import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";

export async function GET() {
  const supabase = createRouteHandlerClient({ cookies });
  const { data, error } = await supabase.from("ai_active_models").select("*").eq("eval_set", "reply_classifier").single();

  if (error) {
    return Response.json({ error }, { status: 400 });
  }

  return Response.json(data);
}
















