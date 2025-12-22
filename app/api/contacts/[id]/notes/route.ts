import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { logNoteAddedV3 } from "@/lib/contactActivityV3";

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = createRouteHandlerClient({ cookies });
  const { data: { user } } = await supabase.auth.getUser();
  
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Get user's workspace
  const { data: profile } = await supabase
    .from("profiles")
    .select("workspace_id")
    .eq("id", user.id)
    .single();

  const workspaceId = profile?.workspace_id;
  if (!workspaceId) {
    return NextResponse.json({ error: "No workspace found" }, { status: 400 });
  }

  // Verify contact exists and belongs to workspace
  const { data: contact } = await supabase
    .from("contacts")
    .select("id, workspace_id")
    .eq("id", params.id)
    .eq("workspace_id", workspaceId)
    .single();

  if (!contact) {
    return NextResponse.json(
      { error: "Contact not found" },
      { status: 404 }
    );
  }

  const body = await req.json().catch(() => ({}));
  const { body: noteBody } = body;

  if (!noteBody || typeof noteBody !== "string" || noteBody.trim().length === 0) {
    return NextResponse.json(
      { error: "Note body is required" },
      { status: 400 }
    );
  }

  // Insert note
  const { data: note, error } = await supabase
    .from("contact_notes")
    .insert({
      contact_id: params.id,
      workspace_id: workspaceId,
      user_id: user.id,
      body: noteBody.trim(),
    })
    .select()
    .single();

  if (error) {
    console.error("Note insert error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Log activity to v3 contact_activity table (Block 13500)
  await logNoteAddedV3(params.id, {
    noteText: noteBody.trim(),
    createdBy: user.id,
  });

  return NextResponse.json({ note });
}

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = createRouteHandlerClient({ cookies });
  const { data: { user } } = await supabase.auth.getUser();
  
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Get user's workspace
  const { data: profile } = await supabase
    .from("profiles")
    .select("workspace_id")
    .eq("id", user.id)
    .single();

  const workspaceId = profile?.workspace_id;
  if (!workspaceId) {
    return NextResponse.json({ error: "No workspace found" }, { status: 400 });
  }

  // Get notes for this contact
  const { data: notes, error } = await supabase
    .from("contact_notes")
    .select(`
      *,
      user:user_id (
        id,
        email,
        full_name
      )
    `)
    .eq("contact_id", params.id)
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ notes: notes || [] });
}



