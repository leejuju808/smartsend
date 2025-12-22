import { createClient } from "@/lib/supabase/server";

export async function POST(req: Request) {
  const supabase = createClient();
  const { ids } = await req.json(); // array of notification IDs

  const { data: userResult } = await supabase.auth.getUser();
  const user = userResult.user;

  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { error } = await supabase
    .from("notifications")
    .update({ is_read: true })
    .in("id", ids)
    .eq("user_id", user.id);

  if (error) return Response.json({ error }, { status: 400 });

  return Response.json({ ok: true }, { status: 200 });
}







