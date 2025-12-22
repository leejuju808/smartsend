import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { parse } from "csv-parse/sync";

/**
 * POST /api/imports/[id]/retry
 * Retries failed rows from an import
 * 
 * This re-runs the failed rows through the import pipeline using the original mapping
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    // Get the import record with mapping
    const { data: importRecord, error: importError } = await supabase
      .from("imports")
      .select("workspace_id, mapping, user_id")
      .eq("id", id)
      .single();

    if (importError || !importRecord) {
      return NextResponse.json({ error: "Import not found" }, { status: 404 });
    }

    // Verify workspace access
    const { data: member } = await supabase
      .from("team_members")
      .select("workspace_id")
      .eq("workspace_id", importRecord.workspace_id)
      .eq("user_id", user.id)
      .eq("status", "active")
      .single();

    if (!member) {
      return NextResponse.json({ error: "Workspace access denied" }, { status: 403 });
    }

    // Get all errors for this import
    const { data: errors, error: errorsError } = await supabase
      .from("import_errors")
      .select("id, row_data, error_message")
      .eq("import_id", id);

    if (errorsError) {
      return NextResponse.json({ error: errorsError.message }, { status: 500 });
    }

    if (!errors || errors.length === 0) {
      return NextResponse.json({ ok: true, retried: 0, message: "No errors to retry" });
    }

    const mapping = importRecord.mapping as any;
    if (!mapping || !mapping.email) {
      return NextResponse.json({ error: "Invalid mapping" }, { status: 400 });
    }

    // Re-process each error row
    // This is a simplified version - you may want to integrate with your existing import logic
    const workspaceId = importRecord.workspace_id;
    let retried = 0;
    let stillFailed = 0;

    // Get existing contacts for deduplication
    const { data: existingContacts } = await supabase
      .from("contacts")
      .select("email")
      .eq("workspace_id", workspaceId);

    const existingSet = new Set(
      (existingContacts || []).map((c: any) => c.email?.toLowerCase())
    );

    // Process each error row
    for (const errorRow of errors) {
      const rowData = errorRow.row_data as any;
      
      // Extract email using mapping
      const emailRaw = rowData[mapping.email];
      if (!emailRaw) {
        stillFailed++;
        continue;
      }

      const email = emailRaw.trim().toLowerCase();
      
      // Basic email validation
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        stillFailed++;
        continue;
      }

      // Check duplicates
      if (existingSet.has(email)) {
        stillFailed++;
        continue;
      }

      // Try to insert contact
      const contact: any = {
        workspace_id: workspaceId,
        email,
        first_name: mapping.first_name ? rowData[mapping.first_name] || null : null,
        last_name: mapping.last_name ? rowData[mapping.last_name] || null : null,
        company: mapping.company ? rowData[mapping.company] || null : null,
        title: mapping.title ? rowData[mapping.title] || null : null,
        phone: mapping.phone ? rowData[mapping.phone] || null : null,
      };

      const { error: insertError } = await supabase
        .from("contacts")
        .insert(contact);

      if (!insertError) {
        retried++;
        existingSet.add(email); // Add to set to prevent duplicates in this batch
        // Delete the error record since it succeeded
        await supabase.from("import_errors").delete().eq("id", errorRow.id);
      } else {
        stillFailed++;
      }
    }

    // Update import stats
    await supabase
      .from("imports")
      .update({
        success_rows: (importRecord.success_rows || 0) + retried,
        failed_rows: stillFailed,
      })
      .eq("id", id);

    return NextResponse.json({
      ok: true,
      retried,
      still_failed: stillFailed,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Failed to retry import" },
      { status: 500 }
    );
  }
}









