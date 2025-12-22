// Block 416 — Team Collaboration v1: Workspace Invite API
// app/api/workspaces/invite/route.ts
import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";

export async function POST(req: NextRequest) {
  try {
    const { email, role } = await req.json();
    
    if (!email) {
      return NextResponse.json({ error: "Email is required" }, { status: 400 });
    }

    if (!role || !["owner", "manager", "member"].includes(role)) {
      return NextResponse.json({ error: "Invalid role. Must be owner, manager, or member" }, { status: 400 });
    }

    const supabase = createRouteHandlerClient({ cookies });
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get workspace of the requester
    const { data: workspace } = await supabase
      .from("workspace_members")
      .select("workspace_id")
      .eq("user_id", user.id)
      .single();

    if (!workspace) {
      return NextResponse.json({ error: "No workspace found" }, { status: 400 });
    }

    const workspace_id = workspace.workspace_id;

    // Check if user already exists
    const { data: existingUser } = await supabase
      .from("profiles")
      .select("id")
      .eq("email", email.toLowerCase())
      .maybeSingle();

    if (existingUser) {
      // User exists - add them directly
      const { error: insertError } = await supabase
        .from("workspace_members")
        .insert({
          workspace_id,
          user_id: existingUser.id,
          role,
        })
        .select();

      if (insertError) {
        // Check if it's a duplicate
        if (insertError.code === "23505") {
          return NextResponse.json({ error: "User is already a member" }, { status: 400 });
        }
        return NextResponse.json({ error: insertError.message }, { status: 400 });
      }

      // Log the action
      await supabase.rpc("log_action", {
        p_actor_id: user.id,
        p_workspace_id: workspace_id,
        p_action: "team_member_added",
        p_target_type: "workspace_member",
        p_target_id: existingUser.id,
        p_details: { email, role }
      });

      return NextResponse.json({ success: true, added: true });
    } else {
      // User doesn't exist - store email for pending invite
      const { error: insertError } = await supabase
        .from("workspace_members")
        .insert({
          workspace_id,
          invited_email: email.toLowerCase(),
          role,
        })
        .select();

      if (insertError) {
        // Check if it's a duplicate
        if (insertError.code === "23505") {
          return NextResponse.json({ error: "Invite already sent to this email" }, { status: 400 });
        }
        return NextResponse.json({ error: insertError.message }, { status: 400 });
      }

      // Log the action
      await supabase.rpc("log_action", {
        p_actor_id: user.id,
        p_workspace_id: workspace_id,
        p_action: "team_member_invited",
        p_target_type: "workspace_member",
        p_target_id: null,
        p_details: { email: email.toLowerCase(), role }
      });

      return NextResponse.json({ success: true, added: false });
    }
  } catch (error) {
    console.error("Error inviting team member:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}