import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/auth-helpers-nextjs";

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const { leadIds } = await req.json(); // string[]
  if (!Array.isArray(leadIds) || leadIds.length === 0)
    return NextResponse.json({ ok: false, error: "No leads" }, { status: 400 });

  const s = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: () => cookies() }
  );

  const { data: { user } } = await s.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: "Not authenticated" }, { status: 401 });

  // Validate campaign belongs to user's org
  const { data: campaign } = await s
    .from("campaigns")
    .select("org_id")
    .eq("id", params.id)
    .single();

  if (!campaign?.org_id) {
    return NextResponse.json({ ok: false, error: "Campaign not found" }, { status: 404 });
  }

  // Get user's org_id
  const { data: profile } = await s
    .from("profiles")
    .select("org_id")
    .eq("id", user.id)
    .single();

  if (!profile?.org_id || profile.org_id !== campaign.org_id) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 403 });
  }

  const rows = leadIds.map((lid: string) => ({ campaign_id: params.id, lead_id: lid }));
  const { error } = await s.from("campaign_leads").upsert(rows, { onConflict: "campaign_id,lead_id" });
  
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });

  // Count now in campaign
  const { count } = await s
    .from("campaign_leads")
    .select("*", { count: "exact", head: true })
    .eq("campaign_id", params.id);
    
  return NextResponse.json({ ok: true, count });
}

