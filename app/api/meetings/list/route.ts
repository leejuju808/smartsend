import { createClient } from "@/lib/supabase/server";

export async function POST(req: Request) {
  const supabase = createClient();
  const { workspaceId, status } = await req.json();

  let query = supabase
    .from("meeting_pipeline_view")
    .select("*")
    .eq("workspace_id", workspaceId)
    .order("start_time", { ascending: true });

  if (status) {
    query = query.eq("status", status);
  }

  const { data, error } = await query;
  if (error) return Response.json({ error }, { status: 400 });

  return Response.json({ meetings: data }, { status: 200 });
}







