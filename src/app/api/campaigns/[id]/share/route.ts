import { NextRequest, NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase/server";
import { getUserPlan, assertTeam } from "@/lib/plan";

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const body = await req.json();
  const { orgId, can_edit = false, can_send = true } = body;
  if (!orgId)
    return NextResponse.json({ error: "orgId required" }, { status: 400 });

  const supabase = getServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Gate: Team plan required for campaign sharing
  try {
    const plan = await getUserPlan(user.id);
    assertTeam(plan);
  } catch (error: any) {
    if (error.message === 'UPGRADE_REQUIRED') {
      return NextResponse.json(
        { error: 'Team plan required for campaign sharing. Please upgrade.' },
        { status: 402 }
      );
    }
    throw error;
  }
  
  // RLS will enforce admin rights on the campaign's org
  const { error } = await supabase.from("campaign_shares").upsert({
    campaign_id: params.id,
    org_id: orgId,
    can_edit,
    can_send,
  });
  
  if (error)
    return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { searchParams } = new URL(req.url);
  const orgId = searchParams.get("orgId");
  
  if (!orgId) {
    return NextResponse.json({ error: "orgId required" }, { status: 400 });
  }

  const supabase = getServerSupabase();
  const { data, error } = await supabase
    .from("campaign_shares")
    .select("*")
    .eq("campaign_id", params.id)
    .eq("org_id", orgId)
    .single();

  if (error || !data) {
    return NextResponse.json({ share: null });
  }

  return NextResponse.json({ share: data });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { searchParams } = new URL(req.url);
  const orgId = searchParams.get("orgId");
  if (!orgId)
    return NextResponse.json({ error: "orgId required" }, { status: 400 });
  
  const supabase = getServerSupabase();
  const { error } = await supabase
    .from("campaign_shares")
    .delete()
    .match({ campaign_id: params.id, org_id: orgId });
  
  if (error)
    return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
