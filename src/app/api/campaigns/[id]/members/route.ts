import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";

export async function GET(_: Request, { params }: { params: { id: string } }) {
  const supabase = createRouteHandlerClient({ cookies });

  const { data, error } = await supabase
    .from("campaign_members")
    .select("id, user_id, role, created_at, user:auth.users(email)")
    .eq("campaign_id", params.id)
    .order("created_at", { ascending: true });

  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });

  return Response.json({ members: data });
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const supabase = createRouteHandlerClient({ cookies });
  const body = await req.json();
  const { user_id, role } = body as { user_id: string; role: "viewer" | "editor" | "owner" };

  const { error } = await supabase
    .from("campaign_members")
    .update({ role })
    .eq("campaign_id", params.id)
    .eq("user_id", user_id);

  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });

  return Response.json({ ok: true });
}

export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  const supabase = createRouteHandlerClient({ cookies });
  const { searchParams } = new URL(req.url);
  const user_id = searchParams.get("user_id");

  if (!user_id) return new Response(JSON.stringify({ error: "user_id required" }), { status: 400 });

  const { error } = await supabase
    .from("campaign_members")
    .delete()
    .eq("campaign_id", params.id)
    .eq("user_id", user_id);

  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });

  return Response.json({ ok: true });
}
