import { NextRequest, NextResponse } from "next/server";
import { getUserAndWorkspace } from "@/lib/api-helpers";
import { validateContacts, ContactCSVRow } from "@/lib/validation/contact-validator";

/**
 * POST /api/contacts/validate-upload
 * 
 * Validates contact rows without importing them.
 * Returns detailed validation results for each row.
 */
export async function POST(req: NextRequest) {
  try {
    const { user, supabase, workspaceId } = await getUserAndWorkspace();
    
    const body = await req.json();
    const { rows, checkMX = false } = body;

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
      address: undefined, // Address not stored separately in current schema
    }));

    // Validate contacts
    const validationResult = await validateContacts(
      rows as ContactCSVRow[],
      existingEmails,
      existingContactsList,
      {
        checkMX: checkMX === true,
        skipMXCheck: false,
        maxRows: 25000,
      }
    );

    return NextResponse.json({
      ok: true,
      ...validationResult,
    });
  } catch (error: any) {
    console.error("Validation error:", error);
    return NextResponse.json(
      { 
        error: error.message || "Validation failed",
        ok: false 
      },
      { status: 400 }
    );
  }
}




























































