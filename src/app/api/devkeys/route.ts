import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import crypto from "crypto";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const workspace_id = searchParams.get("workspace_id");

  if (!workspace_id) {
    return NextResponse.json({ error: "Missing workspace_id" }, { status: 400 });
  }

  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: () => cookieStore }
  );

  const { data, error } = await supabase
    .from("api_keys")
    .select("*")
    .eq("workspace_id", workspace_id)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ keys: data });
}

export async function POST(req: Request) {
  const { workspace_id, label } = await req.json();
  if (!workspace_id || !label)
    return NextResponse.json({ error: "Missing data" }, { status: 400 });

  const key = "sk_live_" + crypto.randomBytes(24).toString("hex");

  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: () => cookieStore }
  );

  const { data, error } = await supabase
    .from("api_keys")
    .insert({
      workspace_id,
      label,
      api_key: key,
      status: "active",
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, key: data.api_key });
}

export async function PATCH(req: Request) {
  const { id, status } = await req.json();
  
  if (!id || !status) {
    return NextResponse.json({ error: "Missing id or status" }, { status: 400 });
  }

  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: () => cookieStore }
  );

  const { error } = await supabase.from("api_keys").update({ status }).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}