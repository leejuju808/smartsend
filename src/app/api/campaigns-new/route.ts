// app/api/campaigns/route.ts
import { NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase/server";

export async function GET() {
  const supabase = getServerSupabase();
  const { data: { user }, error: uerr } = await supabase.auth.getUser();
  if (uerr || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await supabase
    .from("campaigns")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ data });
}

export async function POST(req: Request) {
  const supabase = getServerSupabase();
  const { data: { user }, error: uerr } = await supabase.auth.getUser();
  if (uerr || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await req.json();
    const { name, subject, messages } = body as {
      name: string;
      subject: string;
      messages: Array<{ position: number; label: string; dayOffset: number; body: string }>;
    };

    if (!name || !subject || !Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }

    // Get current org_id
    const { getCurrentOrgId } = await import("@/lib/org-helpers");
    const orgId = await getCurrentOrgId();

    // Insert campaign
    const { data: camp, error: cerr } = await supabase
      .from("campaigns")
      .insert({ user_id: user.id, name, subject, org_id: orgId })
      .select("*")
      .single();
    if (cerr) return NextResponse.json({ error: cerr.message }, { status: 400 });

    // Insert messages
    const rows = messages.map((m) => ({
      user_id: user.id,
      campaign_id: camp.id,
      position: m.position,
      label: m.label,
      day_offset: m.dayOffset,
      body: m.body,
    }));

    const { error: merr } = await supabase.from("campaign_messages").insert(rows);
    if (merr) return NextResponse.json({ error: merr.message }, { status: 400 });

    return NextResponse.json({ ok: true, data: camp }, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Error" }, { status: 400 });
  }
}