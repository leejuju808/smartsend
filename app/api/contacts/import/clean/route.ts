// Block 15400 — One-Click Clean-Up API
// POST /api/contacts/import/clean
// Cleans CSV data before import

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { cleanRows } from "@/lib/import/data-cleanup";

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
  const { session_id, rows, column_mapping } = body as {
    session_id: string;
    rows: Record<string, any>[];
    column_mapping: Record<string, string>;
  };

  if (!session_id || !rows || !column_mapping) {
    return NextResponse.json(
      { error: "Missing session_id, rows, or column_mapping" },
      { status: 400 }
    );
  }

  // Verify session belongs to user's workspace
  const { data: session, error: sessionError } = await supabase
    .from("import_sessions")
    .select("workspace_id")
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

  // Clean the rows
  const { cleanedRows, stats } = cleanRows(rows, column_mapping);

  // Update session with cleaned data
  const { error: updateError } = await supabase
    .from("import_sessions")
    .update({
      cleaned_data: cleanedRows.slice(0, 100), // Store preview of cleaned data
    })
    .eq("id", session_id);

  if (updateError) {
    return NextResponse.json(
      { error: updateError.message },
      { status: 500 }
    );
  }

  return NextResponse.json({
    cleaned_rows: cleanedRows,
    stats: {
      rows_cleaned: stats.rowsCleaned,
      emails_normalized: stats.emailsNormalized,
      duplicates_merged: stats.duplicatesMerged,
      spaces_trimmed: stats.spacesTrimmed,
      zips_formatted: stats.zipsFormatted,
      names_normalized: stats.namesNormalized,
      long_fields_trimmed: stats.longFieldsTrimmed,
    },
  });
}





















































