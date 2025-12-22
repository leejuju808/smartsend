import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = createClient();
  const { data: userResult } = await supabase.auth.getUser();
  const user = userResult.user;

  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("notifications")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) return Response.json({ error }, { status: 400 });

  return Response.json({ notifications: data }, { status: 200 });
}
