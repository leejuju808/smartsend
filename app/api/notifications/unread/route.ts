import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = createClient();
  const { data: userResult } = await supabase.auth.getUser();
  const user = userResult.user;

  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("notifications_summary_view")
    .select("unread_count")
    .eq("user_id", user.id)
    .single();

  if (error && error.code !== "PGRST116") {
    return Response.json({ error }, { status: 400 });
  }

  return Response.json({ unread: data?.unread_count ?? 0 }, { status: 200 });
}
