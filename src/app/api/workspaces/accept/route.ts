// app/api/workspaces/accept/route.ts
import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";

export async function POST(req: NextRequest) {
  try {
    const { token } = await req.json();
    
    if (!token) {
      return NextResponse.json({ error: "Missing token" }, { status: 400 });
    }

    const supabase = createRouteHandlerClient({ cookies });
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) {
      return NextResponse.json({ error: "Sign in required" }, { status: 401 });
    }

    // Verify invite is valid and not expired
    const { data: inv, error } = await supabase
      .from("workspace_invites")
      .select("workspace_id, role, expires_at, accepted_at")
      .eq("token", token)
      .maybeSingle();

    if (error || !inv) {
      return NextResponse.json({ error: "Invalid invite" }, { status: 400 });
    }

    if (inv.accepted_at) {
      return NextResponse.json({ error: "Invite already used" }, { status: 400 });
    }

    if (new Date(inv.expires_at) < new Date()) {
      return NextResponse.json({ error: "Invite expired" }, { status: 400 });
    }

    // Upsert member
    const { error: upErr } = await supabase.from("workspace_members").upsert({
      workspace_id: inv.workspace_id, 
      user_id: auth.user.id, 
      role: inv.role
    }, {
      onConflict: 'workspace_id,user_id'
    });

    if (upErr) {
      return NextResponse.json({ error: upErr.message }, { status: 400 });
    }

    // Mark invite as accepted
    await supabase.from("workspace_invites").update({
      accepted_at: new Date().toISOString()
    }).eq("token", token);

    return NextResponse.json({ 
      ok: true, 
      workspace_id: inv.workspace_id 
    });
  } catch (error) {
    console.error("Error accepting invite:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}