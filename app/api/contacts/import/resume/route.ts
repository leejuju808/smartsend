// Block 15400 — Resume Import
// POST /api/contacts/import/resume
// Resumes a paused or failed import

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

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
  const { session_id } = body as { session_id: string };

  if (!session_id) {
    return NextResponse.json({ error: "Missing session_id" }, { status: 400 });
  }

  // Verify session belongs to user's workspace
  const { data: session, error: sessionError } = await supabase
    .from("import_sessions")
    .select("workspace_id, status, processed_rows, total_rows")
    .eq("id", session_id)
    .single();

  if (sessionError || !session) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  // Verify workspace membership
  const { data: membership } = await supabase
    .from("workspace_members")
    .select("workspace_id")
    .eq("user_id", user.id)
    .eq("workspace_id", session.workspace_id)
    .single();

  if (!membership) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  // Check if import can be resumed
  if (session.status === "completed") {
    return NextResponse.json(
      { error: "Import already completed" },
      { status: 400 }
    );
  }

  if (session.status !== "failed" && session.status !== "paused") {
    return NextResponse.json(
      { error: `Cannot resume import with status: ${session.status}` },
      { status: 400 }
    );
  }

  // Update session to pending/running
  const { error: updateError } = await supabase
    .from("import_sessions")
    .update({
      status: "pending",
      error_message: null,
    })
    .eq("id", session_id);

  if (updateError) {
    return NextResponse.json(
      { error: updateError.message },
      { status: 500 }
    );
  }

  return NextResponse.json({
    success: true,
    session_id,
    resume_from: session.processed_rows || 0,
    total_rows: session.total_rows,
    message: `Import will resume from row ${(session.processed_rows || 0) + 1}`,
  });
}





















































