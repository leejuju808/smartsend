import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const u = new URL(req.url);
  const campaign = u.searchParams.get("campaign");
  if (!campaign) return NextResponse.json({ error: "campaign required" }, { status: 400 });

  const sb = createRouteHandlerClient({ cookies });

  // Read audit rows; restrict visibility to viewers+ via implicit join (logs tied to campaign)
  // First, get the audit rows
  const { data: auditRows, error: auditError } = await sb
    .from("audit_campaign_members")
    .select(`
      id, at, actor, campaign_id, target_user, action, old_role, new_role
    `)
    .eq("campaign_id", campaign)
    .order("at", { ascending: false })
    .limit(200);

  if (auditError) return NextResponse.json({ error: auditError.message }, { status: 400 });

  // Get unique user IDs for actor and target
  const userIds = new Set<string>();
  auditRows?.forEach((row) => {
    if (row.actor) userIds.add(row.actor);
    if (row.target_user) userIds.add(row.target_user);
  });

  // Fetch profiles for all users
  const { data: profiles } = await sb
    .from("profiles")
    .select("id, full_name, email, avatar_url")
    .in("id", Array.from(userIds));

  const profileMap = new Map(profiles?.map((p) => [p.id, p]) || []);

  // Combine audit rows with profiles
  const rows = auditRows?.map((row) => ({
    ...row,
    actor_profile: row.actor ? profileMap.get(row.actor) : null,
    target_profile: row.target_user ? profileMap.get(row.target_user) : null,
  })) || [];

  return NextResponse.json({ rows });
}

