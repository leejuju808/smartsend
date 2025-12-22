// Block 15400 — Chunked Import Processing
// POST /api/contacts/import/process
// Processes import in chunks with resume capability

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { cleanRows } from "@/lib/import/data-cleanup";

export const runtime = "nodejs";

const CHUNK_SIZE = 1000; // Process 1000 rows at a time

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
  const {
    session_id,
    list_id,
    rows,
    column_mapping,
    default_tags = [],
    treat_same_email_as_same_homeowner = true,
  } = body as {
    session_id: string;
    list_id?: string;
    rows: Record<string, any>[];
    column_mapping: Record<string, string>;
    default_tags?: string[];
    treat_same_email_as_same_homeowner?: boolean;
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
    .select("workspace_id, processed_rows, total_rows, status")
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

  const workspaceId = session.workspace_id;

  // Update session status to running
  await supabase
    .from("import_sessions")
    .update({ status: "running" })
    .eq("id", session_id);

  // Clean rows first
  const { cleanedRows } = cleanRows(rows, column_mapping);

  // Process in chunks
  let processed = session.processed_rows || 0;
  let totalAdded = 0;
  let totalUpdated = 0;
  let badEmailsSkipped = 0;
  let duplicatesRemoved = 0;
  const seenEmails = new Set<string>();

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const emailField = Object.keys(column_mapping).find(
    (col) => column_mapping[col] === "email"
  );

  for (let i = 0; i < cleanedRows.length; i += CHUNK_SIZE) {
    const chunk = cleanedRows.slice(i, i + CHUNK_SIZE);
    const contactsToUpsert: any[] = [];
    const listMembersToInsert: any[] = [];

    for (const row of chunk) {
      processed++;

      // Extract email
      const email = emailField ? String(row[emailField] || "").trim().toLowerCase() : "";
      
      if (!email || !emailRegex.test(email)) {
        badEmailsSkipped++;
        continue;
      }

      // Check for duplicates within this import
      if (seenEmails.has(email)) {
        duplicatesRemoved++;
        continue;
      }
      seenEmails.add(email);

      // Build contact object
      const contact: any = {
        workspace_id: workspaceId,
        email,
      };

      // Map fields
      for (const [csvCol, fieldType] of Object.entries(column_mapping)) {
        const value = row[csvCol];
        if (!value || String(value).trim().length === 0) continue;

        switch (fieldType) {
          case "first_name":
            contact.first_name = String(value).trim();
            break;
          case "last_name":
            contact.last_name = String(value).trim();
            break;
          case "full_name":
            // Try to split full name
            const nameParts = String(value).trim().split(/\s+/);
            if (nameParts.length >= 2) {
              contact.first_name = nameParts[0];
              contact.last_name = nameParts.slice(1).join(" ");
            } else {
              contact.first_name = nameParts[0];
            }
            break;
          case "phone":
            contact.phone = String(value).trim();
            break;
          case "city":
            contact.city = String(value).trim();
            break;
          case "state":
            contact.state = String(value).trim();
            break;
          case "zip":
            contact.zip = String(value).trim();
            break;
          case "address":
            contact.address = String(value).trim();
            break;
          case "notes":
            contact.notes = String(value).trim();
            break;
          case "past_quote_amount":
            const amount = parseFloat(String(value).replace(/[^0-9.]/g, ""));
            if (!isNaN(amount) && amount > 0) {
              contact.past_quote_amount = amount;
            }
            break;
        }
      }

      // Add default tags
      if (default_tags.length > 0) {
        contact.tags = default_tags;
        contact.source_tags = default_tags;
      }

      contactsToUpsert.push(contact);
    }

    // Upsert contacts (insert or update)
    if (contactsToUpsert.length > 0) {
      const { data: upserted, error: upsertError } = await supabase
        .from("contacts")
        .upsert(contactsToUpsert, {
          onConflict: "workspace_id,email",
          ignoreDuplicates: false,
        })
        .select("id, email");

      if (upsertError) {
        console.error("Error upserting contacts:", upsertError);
        // Continue processing other chunks
        continue;
      }

      // Count new vs updated (simplified - assume all are new for now)
      totalAdded += upserted?.length || 0;

      // Add to list if list_id provided
      if (list_id && upserted) {
        const listMembers = upserted.map((contact) => ({
          workspace_id: workspaceId,
          list_id,
          contact_id: contact.id,
        }));

        await supabase
          .from("contact_list_members")
          .upsert(listMembers, {
            onConflict: "list_id,contact_id",
            ignoreDuplicates: true,
          });
      }
    }

    // Update session progress
    await supabase
      .from("import_sessions")
      .update({
        processed_rows: processed,
        status: processed >= session.total_rows ? "completed" : "running",
      })
      .eq("id", session_id);
  }

  // Create import results record
  const { error: resultsError } = await supabase.from("import_results").insert({
    session_id,
    workspace_id: workspaceId,
    total_added: totalAdded,
    total_updated: totalUpdated,
    bad_emails_skipped: badEmailsSkipped,
    duplicates_removed: duplicatesRemoved,
  });

  // Update session with summary
  const summary = {
    total_added: totalAdded,
    total_updated: totalUpdated,
    bad_emails_skipped: badEmailsSkipped,
    duplicates_removed: duplicatesRemoved,
  };

  await supabase
    .from("import_sessions")
    .update({
      status: "completed",
      completed_at: new Date().toISOString(),
      import_summary: summary,
    })
    .eq("id", session_id);

  return NextResponse.json({
    success: true,
    processed,
    summary,
  });
}





















































