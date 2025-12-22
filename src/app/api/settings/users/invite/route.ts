import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabaseServer";
import { cookies } from "next/headers";
import { randomBytes } from "crypto";

async function getCurrentOrgId(supabase: any, userId: string): Promise<string | null> {
  const cookieStore = await cookies();
  const orgId = cookieStore.get("current_org_id")?.value || cookieStore.get("org_id")?.value;
  
  if (orgId) return orgId;

  const { data: membership } = await supabase
    .from("org_memberships")
    .select("org_id")
    .eq("user_id", userId)
    .eq("status", "active")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  return membership?.org_id || null;
}

// POST /api/settings/users/invite - Invite a new user
export async function POST(req: NextRequest) {
  try {
    const supabase = createSupabaseServer();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const orgId = await getCurrentOrgId(supabase, user.id);
    if (!orgId) {
      return NextResponse.json({ error: "No organization found" }, { status: 404 });
    }

    // Check if user is owner/admin/manager
    const { data: membership } = await supabase
      .from("org_memberships")
      .select("role")
      .eq("org_id", orgId)
      .eq("user_id", user.id)
      .eq("status", "active")
      .maybeSingle();

    if (!membership || !["owner", "admin", "manager"].includes(membership.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await req.json();
    const { email, role } = body;

    if (!email || !role) {
      return NextResponse.json({ error: "Email and role are required" }, { status: 400 });
    }

    if (!["owner", "admin", "manager", "agent", "member"].includes(role)) {
      return NextResponse.json({ error: "Invalid role" }, { status: 400 });
    }

    // Check if user already exists
    const { data: existingUser } = await supabase.auth.admin.getUserByEmail(email);
    
    // Generate invite token
    const inviteToken = randomBytes(32).toString("hex");

    if (existingUser?.user) {
      // User exists - create active membership
      const { data: existingMembership } = await supabase
        .from("org_memberships")
        .select("id")
        .eq("org_id", orgId)
        .eq("user_id", existingUser.user.id)
        .maybeSingle();

      if (existingMembership) {
        return NextResponse.json({ error: "User is already a member" }, { status: 400 });
      }

      const { data: newMembership, error: insertError } = await supabase
        .from("org_memberships")
        .insert({
          org_id: orgId,
          user_id: existingUser.user.id,
          role,
          status: "active",
          invited_by: user.id,
          accepted_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (insertError) {
        return NextResponse.json({ error: insertError.message }, { status: 500 });
      }

      return NextResponse.json({ ok: true, membership: newMembership });
    } else {
      // User doesn't exist - create pending invite
      const { data: invite, error: inviteError } = await supabase
        .from("org_memberships")
        .insert({
          org_id: orgId,
          invited_email: email.toLowerCase(),
          role,
          status: "pending",
          invited_by: user.id,
          invited_token: inviteToken,
          invited_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (inviteError) {
        return NextResponse.json({ error: inviteError.message }, { status: 500 });
      }

      // TODO: Send invitation email with token
      // For now, return the invite token (in production, send via email)

      return NextResponse.json({ 
        ok: true, 
        invite,
        invite_token: inviteToken, // Remove in production
        message: "Invitation created. Send email with invite link."
      });
    }
  } catch (error: any) {
    console.error("Error inviting user:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}





























































