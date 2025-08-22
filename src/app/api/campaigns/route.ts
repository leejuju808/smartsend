export const runtime = "nodejs";
import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import { resolveSegmentCount } from "@/lib/segment";

export async function GET() {
  const supabase = createRouteHandlerClient({ cookies });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ items: [] });
  const { data } = await supabase.from("campaigns").select("*").eq("user_id", user.id).order("created_at", { ascending: false }).limit(50);
  return NextResponse.json({ items: data || [] });
}

export async function POST(req: NextRequest) {
  const supabase = createRouteHandlerClient({ cookies });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const { name, subject, body_html, from_name, from_email, segment } = body || {};
  if (!name || !subject || !body_html || !segment) return NextResponse.json({ error: "Missing fields" }, { status: 400 });

  const total = await resolveSegmentCount(segment);
  const { data, error } = await supabase.from("campaigns").insert({
    user_id: user.id, name, subject, body_html, from_name, from_email, segment, total
  }).select().single();
  if (error) return NextResponse.json({ error: "Could not create" }, { status: 500 });
  return NextResponse.json({ ok: true, campaign: data });
}

