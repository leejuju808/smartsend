import { NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";

export async function GET() {
  const supabase = createRouteHandlerClient({ cookies });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data } = await supabase.from("suppression_list").select("email, reason, created_at").eq("user_id", user.id).order("created_at", { ascending: false });
  return NextResponse.json({ items: data ?? [] });
}

export async function POST(req: Request) {
  const supabase = createRouteHandlerClient({ cookies });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { email, reason } = await req.json();
  if (!email) return NextResponse.json({ error: "email required" }, { status: 400 });
  const { error } = await supabase.from("suppression_list").upsert({ user_id: user.id, email: email.toLowerCase(), reason: reason ?? "manual" });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}