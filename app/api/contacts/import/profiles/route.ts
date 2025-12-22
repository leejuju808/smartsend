// Block 15400 — Import Profiles API
// GET: List profiles for workspace
// POST: Create new profile
// PUT: Update profile
// DELETE: Delete profile

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

// GET /api/contacts/import/profiles - List profiles
export async function GET(req: Request) {
  const supabase = createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Get user's workspace
  const { data: membership, error: memberError } = await supabase
    .from("workspace_members")
    .select("workspace_id")
    .eq("user_id", user.id)
    .limit(1)
    .single();

  if (memberError || !membership) {
    return NextResponse.json({ error: "No workspace" }, { status: 404 });
  }

  const { data: profiles, error: profilesError } = await supabase
    .from("import_profiles")
    .select("*")
    .eq("workspace_id", membership.workspace_id)
    .order("created_at", { ascending: false });

  if (profilesError) {
    return NextResponse.json(
      { error: profilesError.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ profiles: profiles || [] });
}

// POST /api/contacts/import/profiles - Create profile
export async function POST(req: Request) {
  const supabase = createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { name, source_type, column_mapping, default_tags, send_caps } = body as {
    name: string;
    source_type?: string;
    column_mapping: Record<string, string>;
    default_tags?: string[];
    send_caps?: { daily?: number; weekly?: number };
  };

  if (!name || !column_mapping) {
    return NextResponse.json(
      { error: "Missing name or column_mapping" },
      { status: 400 }
    );
  }

  // Get user's workspace
  const { data: membership, error: memberError } = await supabase
    .from("workspace_members")
    .select("workspace_id")
    .eq("user_id", user.id)
    .limit(1)
    .single();

  if (memberError || !membership) {
    return NextResponse.json({ error: "No workspace" }, { status: 404 });
  }

  const { data: profile, error: profileError } = await supabase
    .from("import_profiles")
    .insert({
      workspace_id: membership.workspace_id,
      name,
      source_type: source_type || 'custom',
      column_mapping,
      default_tags: default_tags || [],
      send_caps: send_caps || null,
    })
    .select()
    .single();

  if (profileError) {
    return NextResponse.json(
      { error: profileError.message },
      { status: 400 }
    );
  }

  return NextResponse.json({ profile });
}

// PUT /api/contacts/import/profiles - Update profile
export async function PUT(req: Request) {
  const supabase = createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { id, name, source_type, column_mapping, default_tags, send_caps } = body as {
    id: string;
    name?: string;
    source_type?: string;
    column_mapping?: Record<string, string>;
    default_tags?: string[];
    send_caps?: { daily?: number; weekly?: number };
  };

  if (!id) {
    return NextResponse.json({ error: "Missing id" }, { status: 400 });
  }

  // Verify profile belongs to user's workspace
  const { data: profile, error: profileError } = await supabase
    .from("import_profiles")
    .select("workspace_id")
    .eq("id", id)
    .single();

  if (profileError || !profile) {
    return NextResponse.json({ error: "Profile not found" }, { status: 404 });
  }

  const { data: membership } = await supabase
    .from("workspace_members")
    .select("workspace_id")
    .eq("user_id", user.id)
    .eq("workspace_id", profile.workspace_id)
    .single();

  if (!membership) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const updateData: any = {};
  if (name !== undefined) updateData.name = name;
  if (source_type !== undefined) updateData.source_type = source_type;
  if (column_mapping !== undefined) updateData.column_mapping = column_mapping;
  if (default_tags !== undefined) updateData.default_tags = default_tags;
  if (send_caps !== undefined) updateData.send_caps = send_caps;

  const { data: updated, error: updateError } = await supabase
    .from("import_profiles")
    .update(updateData)
    .eq("id", id)
    .select()
    .single();

  if (updateError) {
    return NextResponse.json(
      { error: updateError.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ profile: updated });
}

// DELETE /api/contacts/import/profiles - Delete profile
export async function DELETE(req: Request) {
  const supabase = createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");

  if (!id) {
    return NextResponse.json({ error: "Missing id" }, { status: 400 });
  }

  // Verify profile belongs to user's workspace
  const { data: profile, error: profileError } = await supabase
    .from("import_profiles")
    .select("workspace_id")
    .eq("id", id)
    .single();

  if (profileError || !profile) {
    return NextResponse.json({ error: "Profile not found" }, { status: 404 });
  }

  const { data: membership } = await supabase
    .from("workspace_members")
    .select("workspace_id")
    .eq("user_id", user.id)
    .eq("workspace_id", profile.workspace_id)
    .single();

  if (!membership) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const { error: deleteError } = await supabase
    .from("import_profiles")
    .delete()
    .eq("id", id);

  if (deleteError) {
    return NextResponse.json(
      { error: deleteError.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true });
}





















































