// Block 16300 — Lead Ownership v1
// POST /api/contacts/[id]/owner - Assign or change the owner of a contact

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  const supabase = createClient();
  const contactId = params.id;
  const body = await req.json();
  const { owner_user_id } = body as { owner_user_id: string | null };

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Check membership
  const { data: membership, error: memberError } = await supabase
    .from("workspace_members")
    .select("workspace_id, role")
    .eq("user_id", user.id)
    .eq("is_default", true)
    .single();

  if (memberError || !membership) {
    // Fallback: try to get first workspace membership
    const { data: fallbackMembership } = await supabase
      .from("workspace_members")
      .select("workspace_id, role")
      .eq("user_id", user.id)
      .limit(1)
      .single();

    if (!fallbackMembership) {
      return NextResponse.json({ error: "No workspace" }, { status: 404 });
    }

    // Use fallback membership
    const workspaceId = fallbackMembership.workspace_id;
    const role = fallbackMembership.role;

    // Verify contact belongs to workspace
    const { data: contact } = await supabase
      .from("contacts")
      .select("workspace_id")
      .eq("id", contactId)
      .eq("workspace_id", workspaceId)
      .single();

    if (!contact) {
      return NextResponse.json({ error: "Contact not found" }, { status: 404 });
    }

    // For v1: allow owner & admin, or allow everyone to reassign (you decide)
    // Optionally restrict to owner/admin only:
    // if (!["owner", "admin"].includes(role)) {
    //   return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    // }

    // Optionally, validate the new owner is in the same workspace
    if (owner_user_id) {
      const { data: member } = await supabase
        .from("workspace_members")
        .select("id")
        .eq("workspace_id", workspaceId)
        .eq("user_id", owner_user_id)
        .maybeSingle();

      if (!member) {
        return NextResponse.json(
          { error: "User is not in this workspace" },
          { status: 400 }
        );
      }
    }

    // Update contact owner
    const { error: updateError } = await supabase
      .from("contacts")
      .update({ owner_user_id })
      .eq("id", contactId);

    if (updateError) {
      return NextResponse.json(
        { error: updateError.message },
        { status: 400 }
      );
    }

    // Log in activity stream (if table exists)
    try {
      await supabase.from("contact_activity").insert({
        workspace_id: workspaceId,
        contact_id: contactId,
        activity_type: "profile_updated",
        title: "Owner changed",
        meta: { owner_user_id },
      });
    } catch (e) {
      // Activity table might not exist, ignore
    }

    return NextResponse.json({ ok: true });
  }

  const workspaceId = membership.workspace_id;

  // Verify contact belongs to workspace
  const { data: contact } = await supabase
    .from("contacts")
    .select("workspace_id")
    .eq("id", contactId)
    .eq("workspace_id", workspaceId)
    .single();

  if (!contact) {
    return NextResponse.json({ error: "Contact not found" }, { status: 404 });
  }

  // For v1: allow owner & admin, or allow everyone to reassign (you decide)
  // Optionally restrict to owner/admin only:
  // if (!["owner", "admin"].includes(membership.role)) {
  //   return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  // }

  // Optionally, validate the new owner is in the same workspace
  if (owner_user_id) {
    const { data: member } = await supabase
      .from("workspace_members")
      .select("id")
      .eq("workspace_id", workspaceId)
      .eq("user_id", owner_user_id)
      .maybeSingle();

    if (!member) {
      return NextResponse.json(
        { error: "User is not in this workspace" },
        { status: 400 }
      );
    }
  }

  // Update contact owner
  const { error: updateError } = await supabase
    .from("contacts")
    .update({ owner_user_id })
    .eq("id", contactId);

  if (updateError) {
    return NextResponse.json(
      { error: updateError.message },
      { status: 400 }
    );
  }

  // Log in activity stream (if table exists)
  try {
    await supabase.from("contact_activity").insert({
      workspace_id: workspaceId,
      contact_id: contactId,
      activity_type: "profile_updated",
      title: "Owner changed",
      meta: { owner_user_id },
    });
  } catch (e) {
    // Activity table might not exist, ignore
  }

  return NextResponse.json({ ok: true });
}



























































