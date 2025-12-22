import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";

export async function GET() {
  const sb = createRouteHandlerClient({ cookies });
  const { data: { user } } = await sb.auth.getUser();
  const g = await sb.from("ooo_keywords").select("id,user_id,phrase").is("user_id", null).order("phrase");
  const m = user ? await sb.from("ooo_keywords").select("id,user_id,phrase").eq("user_id", user.id).order("phrase") : { data: [] };
  if (g.error) return NextResponse.json({ error: g.error.message }, { status: 400 });
  return NextResponse.json({ global: g.data || [], mine: m.data || [] });
}

export async function POST(req: NextRequest) {
  const sb = createRouteHandlerClient({ cookies });
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { phrase } = await req.json();
  const ins = await sb.from("ooo_keywords").insert({ user_id: user.id, phrase }).select("*").single();
  if (ins.error) return NextResponse.json({ error: ins.error.message }, { status: 400 });
  return NextResponse.json({ ok: true, keyword: ins.data });
}

export async function DELETE(req: NextRequest) {
  const sb = createRouteHandlerClient({ cookies });
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const id = new URL(req.url).searchParams.get("id")!;
  const del = await sb.from("ooo_keywords").delete().eq("id", id).eq("user_id", user.id);
  if (del.error) return NextResponse.json({ error: del.error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}



