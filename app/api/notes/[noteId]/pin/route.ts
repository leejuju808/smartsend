import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(_req: Request, { params }: { params: { noteId: string } }) {
  const supabase = createClient();

  const {
    data: note,
    error: noteError,
  } = await supabase
    .from("lead_notes")
    .select("lead_id, campaign_id")
    .eq("id", params.noteId)
    .maybeSingle();

  if (noteError) {
    return NextResponse.json({ error: noteError.message }, { status: 400 });
  }

  if (!note) {
    return NextResponse.json({ error: "Note not found" }, { status: 404 });
  }

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError) {
    return NextResponse.json({ error: authError.message }, { status: 400 });
  }

  if (!user) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const { error } = await supabase.from("lead_pins").upsert(
    {
      lead_id: note.lead_id,
      note_id: params.noteId,
      pinned_by: user.id,
      pinned_at: new Date().toISOString(),
    },
    { onConflict: "lead_id,note_id", ignoreDuplicates: false },
  );

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}


