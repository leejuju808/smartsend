import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";

export async function POST(req: NextRequest) {
  const supabase = createRouteHandlerClient({ cookies });
  const { token } = await req.json() as { token: string };

  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

  const { data: inv, error } = await supabase
    .from("workspace_invites")
    .select("workspace_id, role, expires_at, accepted_at")
    .eq("token", token).maybeSingle();
  if (error || !inv) return NextResponse.json({ error: "Invalid invite" }, { status: 400 });
  if (inv.accepted_at) return NextResponse.json({ error: "Invite already used" }, { status: 400 });
  if (new Date(inv.expires_at) < new Date()) return NextResponse.json({ error: "Invite expired" }, { status: 400 });

  // Upsert member
  const { error: upErr } = await supabase.from("workspace_members").upsert({
    workspace_id: inv.workspace_id, user_id: auth.user.id, role: inv.role
  });
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 400 });

  await supabase.from("workspace_invites").update({
    accepted_by: auth.user.id, accepted_at: new Date().toISOString()
  }).eq("token", token);

  return NextResponse.json({ ok: true, workspace_id: inv.workspace_id });
}