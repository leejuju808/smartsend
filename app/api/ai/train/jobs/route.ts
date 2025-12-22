import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";

export async function GET() {
  const supabase = createRouteHandlerClient({ cookies });
  const { data, error } = await supabase
    .from("ai_training_jobs")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(25);

  if (error) {
    return Response.json({ error }, { status: 400 });
  }

  return Response.json(data ?? []);
}
















