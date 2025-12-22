// app/api/campaigns/[id]/messages/route.ts
import { NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase/server";

export async function PUT(req: Request, ctx: { params: { id: string } }) {
  const supabase = getServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const id = ctx.params.id;
  const { messages } = await req.json() as {
    messages: Array<{ position: number; label: string; dayOffset: number; body: string }>;
  };
  if (!Array.isArray(messages) || messages.length === 0) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  // quick ownership check
  const { data: camp } = await supabase.from("campaigns").select("id").eq("id", id).single();
  if (!camp) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // delete existing messages
  const { error: delErr } = await supabase.from("campaign_messages").delete().eq("campaign_id", id);
  if (delErr) return NextResponse.json({ error: delErr.message }, { status: 400 });

  // insert new
  const rows = messages.map((m) => ({
    user_id: user.id,
    campaign_id: id,
    position: m.position,
    label: m.label,
    day_offset: m.dayOffset,
    body: m.body,
  }));
  const { error: insErr } = await supabase.from("campaign_messages").insert(rows);
  if (insErr) return NextResponse.json({ error: insErr.message }, { status: 400 });

  return NextResponse.json({ ok: true });
}