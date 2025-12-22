// app/api/campaigns/[id]/recipients/route.ts
import { NextResponse } from "next/server";
import { z } from "zod";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";

const rowSchema = z.object({
  email: z.string().email(),
  name: z.string().optional().nullable(),
});

export async function GET(_: Request, ctx: { params: { id: string } }) {
  const supabase = createRouteHandlerClient({ cookies });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const campaignId = ctx.params.id;

  // simple ownership check
  const { data: camp } = await supabase.from("campaigns")
    .select("id,user_id").eq("id", campaignId).single();
  if (!camp) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { data, error } = await supabase
    .from("campaign_recipients")
    .select("id,email_lower as email,name,status,created_at")
    .eq("campaign_id", campaignId)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ data });
}

export async function POST(req: Request, ctx: { params: { id: string } }) {
  const supabase = createRouteHandlerClient({ cookies });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const campaignId = ctx.params.id;

  // confirm campaign ownership
  const { data: camp } = await supabase.from("campaigns")
    .select("id,user_id").eq("id", campaignId).single();
  if (!camp) return NextResponse.json({ error: "Campaign not found" }, { status: 404 });

  // payload: { rows: [{email, name?}] }
  const { rows } = await req.json() as { rows: Array<{ email: string; name?: string | null }> };

  if (!Array.isArray(rows) || rows.length === 0) {
    return NextResponse.json({ error: "No rows provided" }, { status: 400 });
  }

  // validate + normalize
  const cleaned: { email: string; name?: string | null }[] = [];
  const seen = new Set<string>();
  for (const r of rows) {
    const parsed = rowSchema.safeParse(r);
    if (!parsed.success) continue;
    const email = parsed.data.email.trim().toLowerCase();
    if (seen.has(email)) continue; // de-dupe within upload
    seen.add(email);
    cleaned.push({ email, name: parsed.data.name?.trim() || null });
  }

  if (cleaned.length === 0) {
    return NextResponse.json({ error: "No valid rows after validation" }, { status: 400 });
  }

  // de-dupe against existing
  const { data: existing, error: exErr } = await supabase
    .from("campaign_recipients")
    .select("email_lower")
    .eq("campaign_id", campaignId);
  if (exErr) return NextResponse.json({ error: exErr.message }, { status: 400 });

  const existingSet = new Set((existing ?? []).map(r => r.email_lower.toLowerCase()));
  const toInsert = cleaned.filter(r => !existingSet.has(r.email));

  if (toInsert.length === 0) {
    return NextResponse.json({ ok: true, inserted: 0, skipped: cleaned.length });
  }

  const rowsToInsert = toInsert.map(r => ({
    user_id: user.id,
    campaign_id: campaignId,
    email_lower: r.email,
    name: r.name,
    status: "queued" as const,
  }));

  const { error: insErr } = await supabase.from("campaign_recipients").insert(rowsToInsert);
  if (insErr) return NextResponse.json({ error: insErr.message }, { status: 400 });

  return NextResponse.json({ ok: true, inserted: rowsToInsert.length, skipped: cleaned.length - rowsToInsert.length });
}

export async function DELETE(req: Request, ctx: { params: { id: string } }) {
  const supabase = createRouteHandlerClient({ cookies });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const campaignId = ctx.params.id;
  const { emails } = await req.json() as { emails?: string[] };

  if (!emails || emails.length === 0) {
    // delete ALL recipients for this campaign (use carefully in UI)
    const { error } = await supabase.from("campaign_recipients").delete().eq("campaign_id", campaignId);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ ok: true, deleted: "all" });
  }

  const normalized = emails.map(e => e.toLowerCase());
  const { error } = await supabase.from("campaign_recipients")
    .delete()
    .eq("campaign_id", campaignId)
    .in("email_lower", normalized);

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true, deleted: normalized.length });
}