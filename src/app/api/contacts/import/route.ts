import { NextRequest, NextResponse } from "next/server";
import { getUserAndWorkspace } from "@/lib/api-helpers";
import { validateContacts, ContactCSVRow, ValidatedContact, ValidationErrorCode } from "@/lib/validation/contact-validator";
import { parse } from "csv-parse/sync";

/**
 * POST /api/contacts/import
 * 
 * Enhanced import endpoint with validation guardrails.
 * Accepts validated rows and imports only valid contacts.
 * 
 * Body options:
 * - rows: ContactCSVRow[] - validated contact rows
 * - options: { overwriteDuplicates?: boolean, skipWarnings?: boolean }
 */
export async function POST(req: NextRequest) {
  try {
    const { user, supabase, workspaceId } = await getUserAndWorkspace();
    const userId = user.id;

    const body = await req.json();
    const { rows, options = {} } = body;

    if (!Array.isArray(rows)) {
      return NextResponse.json(
        { error: "rows must be an array" },
        { status: 400 }
      );
    }

    if (rows.length === 0) {
      return NextResponse.json(
        { error: "No rows provided" },
        { status: 400 }
      );
    }

    // Guardrail: Hard limit per upload
    const MAX_ROWS = 25000;
    if (rows.length > MAX_ROWS) {
      return NextResponse.json(
        { 
          error: `Upload exceeds maximum of ${MAX_ROWS} contacts. Please split your file.`,
          ok: false 
        },
        { status: 400 }
      );
    }

    // Get existing contacts for duplicate detection
    const { data: existingContacts } = await supabase
      .from("contacts")
      .select("id, email, first_name, last_name, phone")
      .eq("workspace_id", workspaceId);

    const existingEmails = (existingContacts || []).map(c => c.email);
    const existingContactsList = (existingContacts || []).map(c => ({
      id: c.id,
      email: c.email,
      first_name: c.first_name || undefined,
      last_name: c.last_name || undefined,
      phone: c.phone || undefined,
      address: undefined,
    }));

    // Get suppressed emails
    const { data: suppressed } = await supabase
      .from("suppressions")
      .select("value_lower")
      .eq("workspace_id", workspaceId)
      .eq("kind", "email");

    const suppressedEmails = new Set((suppressed || []).map(s => s.value_lower));

    // Validate contacts (skip MX check for performance during import)
    const validationResult = await validateContacts(
      rows as ContactCSVRow[],
      existingEmails,
      existingContactsList,
      {
        checkMX: false, // Skip MX check during import for speed
        skipMXCheck: true,
        maxRows: MAX_ROWS,
      }
    );

    // Filter contacts based on options
    let contactsToInsert: ValidatedContact[] = [];

    for (const validated of validationResult.results) {
      // Skip invalid contacts
      if (!validated.valid) {
        // Check if we should overwrite duplicates
        if (
          options.overwriteDuplicates &&
          validated.duplicate_of &&
          validated.errors.includes(ValidationErrorCode.DUPLICATE_EMAIL)
        ) {
          // Overwrite: delete existing and add new
          await supabase
            .from("contacts")
            .delete()
            .eq("id", validated.duplicate_of)
            .eq("workspace_id", workspaceId);

          // Add to insert list
          contactsToInsert.push(validated);
        }
        continue;
      }

      // Block 12600: Skip suppressed emails and track count
      if (validated.cleaned.email && suppressedEmails.has(validated.cleaned.email.toLowerCase())) {
        validationResult.summary.suppressed = (validationResult.summary.suppressed || 0) + 1;
        continue;
      }

      // Skip warnings if option is set
      if (options.skipWarnings && validated.warnings.length > 0) {
        continue;
      }

      contactsToInsert.push(validated);
    }

    // Prepare contacts for insertion
    const contactsForDB = contactsToInsert.map(validated => ({
      workspace_id: workspaceId,
      email: validated.cleaned.email!.toLowerCase(),
      first_name: validated.cleaned.first_name || null,
      last_name: validated.cleaned.last_name || null,
      company: validated.cleaned.company || null,
      phone: validated.cleaned.phone || null,
      title: validated.cleaned.title || null,
      custom: {
        ...(validated.cleaned.address && { address: validated.cleaned.address }),
        ...(validated.cleaned.city && { city: validated.cleaned.city }),
        ...(validated.cleaned.state && { state: validated.cleaned.state }),
        ...(validated.cleaned.zip && { zip: validated.cleaned.zip }),
        ...(validated.cleaned.country && { country: validated.cleaned.country }),
      },
    }));

    // Insert contacts in chunks
    let inserted = 0;
    const chunkSize = 500;
    const errors: string[] = [];

    for (let i = 0; i < contactsForDB.length; i += chunkSize) {
      const chunk = contactsForDB.slice(i, i + chunkSize);
      const { error } = await supabase
        .from("contacts")
        .upsert(chunk, {
          onConflict: "workspace_id,email",
          ignoreDuplicates: false,
        });

      if (error) {
        console.error("Insert error:", error);
        errors.push(`Chunk ${i / chunkSize + 1}: ${error.message}`);
      } else {
        inserted += chunk.length;
      }
    }

    // Return summary
    const suppressedCount = validationResult.summary.suppressed || 0;
    return NextResponse.json({
      ok: true,
      summary: {
        total_rows: validationResult.summary.total_rows,
        valid: validationResult.summary.valid,
        invalid: validationResult.summary.invalid,
        warnings: validationResult.summary.warnings,
        duplicates: validationResult.summary.duplicates,
        suppressed: suppressedCount,
        inserted,
        errors: errors.length > 0 ? errors : undefined,
      },
      validation: validationResult,
      suppressed_count: suppressedCount, // Block 12600: Explicit suppressed count
    });
  } catch (error: any) {
    console.error("Import error:", error);
    return NextResponse.json(
      {
        error: error.message || "Import failed",
        ok: false,
      },
      { status: 400 }
    );
  }
}
