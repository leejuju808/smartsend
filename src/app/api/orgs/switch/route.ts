import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createSupabaseServer } from "@/lib/supabaseServer";

export async function POST(req: Request) {
  const { org_id } = await req.json();
  const sb = createSupabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: m } = await sb.from("org_members").select("org_id").eq("org_id", org_id).eq("user_id", user.id).maybeSingle();
  if (!m) return NextResponse.json({ error: "Not a member" }, { status: 403 });

  cookies().set("org", org_id, { path: "/", maxAge: 60*60*24*365 });
  return NextResponse.json({ ok: true });
}