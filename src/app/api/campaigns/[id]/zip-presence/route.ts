import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { z } from "zod";

const PutSchema = z.object({
  zip: z.string().min(1),
  active: z.boolean(),
});

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id: campaignId } = await ctx.params;
  const supabase = createRouteHandlerClient({ cookies });

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  // RLS-scoped access check
  const { data: campaign, error: cErr } = await supabase
    .from("campaigns")
    .select("id")
    .eq("id", campaignId)
    .single();

  if (cErr || !campaign) {
    return NextResponse.json({ ok: false, error: cErr?.message || "Not found" }, { status: 404 });
  }

  const { data: rows, error: vErr } = await supabase
    .from("v_campaign_zip_presence_30d")
    .select("zip, homeowners_contacted, replies, jobs_booked")
    .eq("campaign_id", campaignId)
    .order("homeowners_contacted", { ascending: false })
    .order("zip", { ascending: true })
    .limit(500);

  if (vErr) {
    return NextResponse.json({ ok: false, error: vErr.message }, { status: 500 });
  }

  const { data: controls } = await supabase
    .from("campaign_zip_controls")
    .select("zip, is_active, paused_at")
    .eq("campaign_id", campaignId)
    .limit(1000);

  const controlMap = new Map<string, { is_active: boolean; paused_at: string | null }>();
  for (const c of (controls || []) as any[]) {
    controlMap.set(String(c.zip), { is_active: !!c.is_active, paused_at: c.paused_at ?? null });
  }

  const merged = (rows || []).map((r: any) => {
    const zip = String(r.zip || "unknown");
    const control = controlMap.get(zip);
    return {
      zip,
      homeowners_contacted: Number(r.homeowners_contacted || 0),
      replies: Number(r.replies || 0),
      jobs_booked: Number(r.jobs_booked || 0),
      is_active: control ? control.is_active : true,
      paused_at: control ? control.paused_at : null,
    };
  });

  // Also include any paused zips that currently have zero rows in the 30d view
  for (const [zip, c] of controlMap.entries()) {
    if (!merged.some((m) => m.zip === zip)) {
      merged.push({
        zip,
        homeowners_contacted: 0,
        replies: 0,
        jobs_booked: 0,
        is_active: c.is_active,
        paused_at: c.paused_at,
      });
    }
  }

  // Keep it brutal: show active first, then by contacted desc
  merged.sort((a, b) => {
    if (a.is_active !== b.is_active) return a.is_active ? -1 : 1;
    if (b.homeowners_contacted !== a.homeowners_contacted) return b.homeowners_contacted - a.homeowners_contacted;
    return String(a.zip).localeCompare(String(b.zip));
  });

  return NextResponse.json({ ok: true, rows: merged });
}

export async function PUT(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id: campaignId } = await ctx.params;
  const supabase = createRouteHandlerClient({ cookies });

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const parsed = PutSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: parsed.error.flatten() }, { status: 400 });
  }

  // Access check (RLS)
  const { data: campaign, error: cErr } = await supabase
    .from("campaigns")
    .select("id")
    .eq("id", campaignId)
    .single();

  if (cErr || !campaign) {
    return NextResponse.json({ ok: false, error: cErr?.message || "Not found" }, { status: 404 });
  }

  const zip = parsed.data.zip.trim();
  const active = parsed.data.active;

  const { error: rpcErr } = await supabase.rpc("ss_campaign_set_zip_active", {
    p_campaign_id: campaignId,
    p_zip: zip,
    p_is_active: active,
  });

  if (rpcErr) {
    return NextResponse.json({ ok: false, error: rpcErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}




