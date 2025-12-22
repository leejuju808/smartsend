/**
 * Block 260: Bulk Importer v3 - Re-import Fixed Rows API
 * Re-process rows that were fixed via one-click fixes
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { parse } from "csv-parse/sync";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const supabase = createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Fetch import record
    const { data: importRecord, error: importErr } = await supabase
      .from("imports")
      .select("*")
      .eq("id", id)
      .single();

    if (importErr || !importRecord) {
      return NextResponse.json(
        { error: "Import not found" },
        { status: 404 }
      );
    }

    // Verify workspace access
    const { data: teamMember } = await supabase
      .from("team_members")
      .select("workspace_id")
      .eq("workspace_id", importRecord.workspace_id)
      .eq("user_id", user.id)
      .eq("status", "active")
      .single();

    if (!teamMember) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    // Fetch fixed errors
    const { data: fixedErrors, error: errorsErr } = await supabase
      .from("import_errors")
      .select("*")
      .eq("import_id", id)
      .eq("fixed_pending", true);

    if (errorsErr) {
      return NextResponse.json({ error: errorsErr.message }, { status: 500 });
    }

    if (!fixedErrors || fixedErrors.length === 0) {
      return NextResponse.json(
        { error: "No fixed rows to re-import" },
        { status: 400 }
      );
    }

    // Get mapping from import record
    const mapping = importRecord.mapping as any;
    if (!mapping || !mapping.email) {
      return NextResponse.json(
        { error: "Invalid mapping configuration" },
        { status: 400 }
      );
    }

    // Process fixed rows
    const toInsert: any[] = [];
    const stillErrors: any[] = [];

    for (const error of fixedErrors) {
      const rowData = error.row_data;
      const email = rowData[mapping.email];

      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim().toLowerCase())) {
        stillErrors.push({
          ...error,
          error_message: "Email still invalid after fix",
        });
        continue;
      }

      const contact: any = {
        workspace_id: importRecord.workspace_id,
        email: email.trim().toLowerCase(),
        first_name: mapping.first_name ? rowData[mapping.first_name] || null : null,
        last_name: mapping.last_name ? rowData[mapping.last_name] || null : null,
        company: mapping.company ? rowData[mapping.company] || null : null,
        title: mapping.title ? rowData[mapping.title] || null : null,
        phone: mapping.phone ? rowData[mapping.phone] || null : null,
        custom: {},
      };

      if (Array.isArray(mapping.custom)) {
        for (const key of mapping.custom) {
          if (key && key in rowData) {
            contact.custom[key] = rowData[key];
          }
        }
      }

      toInsert.push(contact);
    }

    // Insert contacts
    let inserted = 0;
    if (toInsert.length > 0) {
      const chunkSize = 1000;
      for (let i = 0; i < toInsert.length; i += chunkSize) {
        const chunk = toInsert.slice(i, i + chunkSize);
        const { error: insErr, count } = await supabase
          .from("contacts")
          .insert(chunk, { count: "exact" });
        if (!insErr) {
          inserted += count || chunk.length;
        }
      }
    }

    // Update or delete fixed errors
    if (inserted > 0) {
      await supabase
        .from("import_errors")
        .delete()
        .in("id", fixedErrors.map((e) => e.id).filter((id) => 
          !stillErrors.some((se) => se.id === id)
        ));
    }

    // Update still-errors
    if (stillErrors.length > 0) {
      for (const error of stillErrors) {
        await supabase
          .from("import_errors")
          .update({
            fixed_pending: false,
            error_message: error.error_message,
          })
          .eq("id", error.id);
      }
    }

    // Update import stats
    await supabase
      .from("imports")
      .update({
        success_rows: (importRecord.success_rows || 0) + inserted,
        failed_rows: Math.max(0, (importRecord.failed_rows || 0) - inserted + stillErrors.length),
      })
      .eq("id", id);

    return NextResponse.json({
      ok: true,
      inserted,
      stillErrors: stillErrors.length,
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e.message ?? "Unknown error" },
      { status: 500 }
    );
  }
}









