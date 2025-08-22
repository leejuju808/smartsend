export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import { normalizeEmail } from "@/lib/email";

export async function GET() {
  const supabase = createRouteHandlerClient({ cookies });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ items: [] });
  const { data } = await supabase
    .from("suppressions")
    .select("id, kind, value_lower, reason, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(200);
  return NextResponse.json({ items: data || [] });
}

export async function POST(req: NextRequest) {
  const supabase = createRouteHandlerClient({ cookies });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  let { kind, value, reason } = body || {};
  kind = (kind || "").toString();
  value = (value || "").toString().trim().toLowerCase();
  if (!["email","domain"].includes(kind) || !value) {
    return NextResponse.json({ error: "kind=email|domain and value required" }, { status: 400 });
  }
  if (kind === "email") value = normalizeEmail(value);

  const { error } = await supabase.from("suppressions").upsert(
    [{ user_id: user.id, kind, value_lower: value, reason: reason || null }],
    { onConflict: "user_id,kind,value_lower" }
  );
  if (error) return NextResponse.json({ error: "Could not add" }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import { normalizeEmail } from "@/lib/email";

export async function GET() {
  const supabase = createRouteHandlerClient({ cookies });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ items: [] });
  const { data } = await supabase
    .from("suppressions")
    .select("id, kind, value_lower, reason, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(200);
  return NextResponse.json({ items: data || [] });
}

export async function POST(req: NextRequest) {
  const supabase = createRouteHandlerClient({ cookies });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  let { kind, value, reason } = body || {};
  kind = (kind || "").toString();
  value = (value || "").toString().trim().toLowerCase();
  if (!["email","domain"].includes(kind) || !value) {
    return NextResponse.json({ error: "kind=email|domain and value required" }, { status: 400 });
  }
  if (kind === "email") value = normalizeEmail(value);

  const { error } = await supabase.from("suppressions").upsert(
    [{ user_id: user.id, kind, value_lower: value, reason: reason || null }],
    { onConflict: "user_id,kind,value_lower" }
  );
  if (error) return NextResponse.json({ error: "Could not add" }, { status: 500 });
  return NextResponse.json({ ok: true });
}

