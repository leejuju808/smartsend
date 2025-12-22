import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";

export async function GET() {
  const sb = createRouteHandlerClient({ cookies });
  const { data: { user } } = await sb.auth.getUser();
  
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // Get global keywords
  const { data: global, error: globalError } = await sb
    .from("opt_out_keywords")
    .select("id,user_id,phrase")
    .is("user_id", null)
    .order("phrase", { ascending: true });

  if (globalError) {
    return NextResponse.json({ error: globalError.message }, { status: 400 });
  }

  // Get user-specific keywords
  const { data: mine, error: mineError } = await sb
    .from("opt_out_keywords")
    .select("id,user_id,phrase")
    .eq("user_id", user.id)
    .order("phrase", { ascending: true });

  if (mineError) {
    return NextResponse.json({ error: mineError.message }, { status: 400 });
  }

  return NextResponse.json({ global: global || [], mine: mine || [] });
}

export async function POST(req: NextRequest) {
  const sb = createRouteHandlerClient({ cookies });
  const { data: { user } } = await sb.auth.getUser();
  
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { phrase } = await req.json();
  
  if (!phrase || !phrase.trim()) {
    return NextResponse.json({ error: "phrase is required" }, { status: 400 });
  }

  const { data, error } = await sb
    .from("opt_out_keywords")
    .insert({ user_id: user.id, phrase: phrase.trim() })
    .select("*")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true, keyword: data });
}

export async function DELETE(req: NextRequest) {
  const sb = createRouteHandlerClient({ cookies });
  const { data: { user } } = await sb.auth.getUser();
  
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");

  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  const { error } = await sb
    .from("opt_out_keywords")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}



