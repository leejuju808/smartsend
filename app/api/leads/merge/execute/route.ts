import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { setAccountContext } from "@/app/api/_utils/account";

export async function POST(req: Request) {
  const supabase = createClient();
  await setAccountContext(supabase);

  const { winner_id, loser_id, fields } = await req.json();

  if (!winner_id || !loser_id) {
    return NextResponse.json(
      { error: "winner_id and loser_id are required" },
      { status: 400 }
    );
  }

  try {
    // 1. Update winner with selected fields
    if (fields && Object.keys(fields).length > 0) {
      const { error: updateError } = await supabase
        .from("leads")
        .update(fields)
        .eq("id", winner_id);

      if (updateError) {
        return NextResponse.json(
          { error: `Failed to update winner: ${updateError.message}` },
          { status: 500 }
        );
      }
    }

    // 2. Move tags
    const { error: tagsError } = await supabase.rpc("merge_tags", {
      winner: winner_id,
      loser: loser_id,
    });

    if (tagsError) {
      console.error("Error merging tags:", tagsError);
      // Continue with merge even if tags fail
    }

    // 3. Move notes
    const { error: notesError } = await supabase.rpc("merge_notes", {
      winner: winner_id,
      loser: loser_id,
    });

    if (notesError) {
      console.error("Error merging notes:", notesError);
      // Continue with merge even if notes fail
    }

    // 4. Move timeline events
    const { error: timelineError } = await supabase.rpc("merge_timeline", {
      winner: winner_id,
      loser: loser_id,
    });

    if (timelineError) {
      console.error("Error merging timeline:", timelineError);
      // Continue with merge even if timeline fails
    }

    // 5. Move reply threads
    const { error: threadsError } = await supabase.rpc("merge_threads", {
      winner: winner_id,
      loser: loser_id,
    });

    if (threadsError) {
      console.error("Error merging threads:", threadsError);
      // Continue with merge even if threads fail
    }

    // 6. Delete loser
    const { error: deleteError } = await supabase
      .from("leads")
      .delete()
      .eq("id", loser_id);

    if (deleteError) {
      return NextResponse.json(
        { error: `Failed to delete loser: ${deleteError.message}` },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}










