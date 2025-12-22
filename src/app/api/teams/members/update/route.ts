import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";

export async function POST(req: NextRequest) {
  const supabase = createRouteHandlerClient({ cookies });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauth" }, { status: 401 });

  const { team_id, user_id, role } = await req.json();
  
  if (!team_id || !user_id || !role) {
    return NextResponse.json({ error: "team_id, user_id, and role are required" }, { status: 400 });
  }

  // Verify requester is admin or owner
  const { data: membership } = await supabase
    .from('team_members')
    .select('role')
    .eq('team_id', team_id)
    .eq('user_id', user.id)
    .single();

  if (!membership || !['owner', 'admin'].includes(membership.role)) {
    return NextResponse.json({ error: "Forbidden: admin or owner role required" }, { status: 403 });
  }

  // Prevent changing owner role (would need special owner transfer flow)
  const { data: targetMember } = await supabase
    .from('team_members')
    .select('role')
    .eq('team_id', team_id)
    .eq('user_id', user_id)
    .single();

  if (targetMember?.role === 'owner' && role !== 'owner') {
    return NextResponse.json({ error: "Cannot change owner role" }, { status: 400 });
  }

  // Validate role
  if (!['admin', 'member', 'viewer'].includes(role)) {
    return NextResponse.json({ error: "Invalid role" }, { status: 400 });
  }

  const { error } = await supabase
    .from("team_members")
    .update({ role })
    .eq("team_id", team_id)
    .eq("user_id", user_id);

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({ ok: true });
}

