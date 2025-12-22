import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

export async function POST(_: Request, { params }: { params: Promise<{ lead_id: string; note_id: string }> }) {
  const supabase = createClient();
  const { lead_id, note_id } = await params;

  // Get current user to verify ownership
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Verify the note exists and belongs to the user
  const { data: existingNote, error: fetchError } = await supabase
    .from("lead_notes")
    .select("user_id")
    .eq("id", note_id)
    .eq("lead_id", lead_id)
    .single();

  if (fetchError || !existingNote) {
    return NextResponse.json({ error: "Note not found" }, { status: 404 });
  }

  if (existingNote.user_id !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { error } = await supabase
    .from("lead_notes")
    .delete()
    .eq("id", note_id);

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({ ok: true });
}










