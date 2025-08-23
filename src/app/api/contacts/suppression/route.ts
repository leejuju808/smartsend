import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function supa() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
}

export async function GET() {
  const sb = supa();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ rows: [] });

  const { data } = await sb.from("suppression_list")
    .select("email,reason").eq("user_id", user.id).order("email");
  return NextResponse.json({ rows: data || [] });
}

export async function POST(req: NextRequest) {
  const sb = supa();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authed" }, { status: 401 });

  const { email, reason } = await req.json();
  if (!email) return NextResponse.json({ error: "email required" }, { status: 400 });

  const e = String(email).trim().toLowerCase();
  const { error } = await sb.from("suppression_list").upsert({ user_id: user.id, email: e, reason: reason || null }, { onConflict: "user_id,email" });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const { data } = await sb.from("suppression_list")
    .select("email,reason").eq("user_id", user.id).order("email");
  return NextResponse.json({ rows: data || [] });
} 