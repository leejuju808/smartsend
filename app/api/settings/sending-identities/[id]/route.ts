import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { cookies } from "next/headers";

// Helper to get current org_id
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

// PATCH /api/settings/sending-identities/[id] - Update an identity
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = createClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const orgId = await getCurrentOrgId(supabase, user.id);
    if (!orgId) {
      return NextResponse.json({ error: "No organization found" }, { status: 400 });
    }

    // Verify identity belongs to org
    const { data: existing, error: fetchError } = await supabase
      .from("email_credentials")
      .select("org_id")
      .eq("id", id)
      .eq("org_id", orgId)
      .single();

    if (fetchError || !existing) {
      return NextResponse.json({ error: "Identity not found" }, { status: 404 });
    }

    const body = await req.json();
    const { identity_name, display_name, is_primary, daily_send_limit } = body;

    const updates: any = {};
    if (identity_name !== undefined) updates.identity_name = identity_name;
    if (display_name !== undefined) updates.display_name = display_name;
    if (is_primary !== undefined) updates.is_primary = is_primary;
    if (daily_send_limit !== undefined) updates.daily_send_limit = daily_send_limit;

    const { data: identity, error } = await supabase
      .from("email_credentials")
      .update(updates)
      .eq("id", id)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ identity });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

// DELETE /api/settings/sending-identities/[id] - Delete an identity
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = createClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const orgId = await getCurrentOrgId(supabase, user.id);
    if (!orgId) {
      return NextResponse.json({ error: "No organization found" }, { status: 400 });
    }

    // Verify identity belongs to org
    const { data: existing, error: fetchError } = await supabase
      .from("email_credentials")
      .select("org_id")
      .eq("id", id)
      .eq("org_id", orgId)
      .single();

    if (fetchError || !existing) {
      return NextResponse.json({ error: "Identity not found" }, { status: 404 });
    }

    // Check if identity is used in any campaigns
    const { data: campaigns } = await supabase
      .from("campaigns")
      .select("id, name")
      .eq("sending_identity_id", id)
      .limit(1);

    if (campaigns && campaigns.length > 0) {
      return NextResponse.json(
        {
          error: `Cannot delete identity: it is used in campaign "${campaigns[0].name}"`,
        },
        { status: 400 }
      );
    }

    const { error } = await supabase.from("email_credentials").delete().eq("id", id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}




























































