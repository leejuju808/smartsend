import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";

export async function GET() {
  const supabase = createRouteHandlerClient({ cookies });
  const { data: me } = await supabase.auth.getUser();
  if (!me?.user) {
    return NextResponse.json({ inbox_filters: {} });
  }
  const { data } = await supabase
    .from("user_prefs")
    .select("inbox_filters")
    .eq("user_id", me.user.id)
    .maybeSingle();
  return NextResponse.json({ inbox_filters: data?.inbox_filters ?? {} });
}

export async function POST(req: NextRequest) {
  const supabase = createRouteHandlerClient({ cookies });
  const { data: me } = await supabase.auth.getUser();
  if (!me?.user) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }
  const body = await req.json().catch(() => ({}));
  const filters = body && typeof body === "object" ? body : {};
  const { error } = await supabase
    .from("user_prefs")
    .upsert({ user_id: me.user.id, inbox_filters: filters }, { onConflict: "user_id" });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}



