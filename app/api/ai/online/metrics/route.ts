import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";

export async function GET() {
  const supabase = createRouteHandlerClient({ cookies });

  const { data, error } = await supabase
    .from("ai_online_metrics")
    .select("*")
    .gte("ts_hour", new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString())
    .order("ts_hour", { ascending: true });

  if (error) {
    return Response.json({ error }, { status: 400 });
  }

  return Response.json(data);
}
















