import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";

// Email validation regex
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface ValidationRow {
  row: number;
  data: Record<string, string>;
  errors: string[];
}

interface ValidationResult {
  validRows: number;
  invalidRows: number;
  duplicateRows: number;
  existingDuplicates: number;
  internalDuplicates: number;
  errors: ValidationRow[];
  sampleValid: any[];
}

export async function POST(req: NextRequest) {
  const supabase = createRouteHandlerClient({ cookies });
  const { data: u } = await supabase.auth.getUser();
  if (!u?.user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  // Get user's workspace
  const { data: profile } = await supabase
    .from("profiles")
    .select("workspace_id")
    .eq("id", u.user.id)
    .single();

  const workspaceId = profile?.workspace_id;
  if (!workspaceId) {
    return NextResponse.json({ ok: false, error: "No workspace found" }, { status: 400 });
  }

  try {
    const body = await req.json();
    const { rows, fieldMapping } = body;

    if (!Array.isArray(rows) || rows.length === 0) {
      return NextResponse.json({ ok: false, error: "No rows provided" }, { status: 400 });
    }

    if (!fieldMapping || !fieldMapping.email) {
      return NextResponse.json({ ok: false, error: "Email field mapping required" }, { status: 400 });
    }

    const emailColumn = fieldMapping.email;
    const validationErrors: ValidationRow[] = [];
    const emailSet = new Set<string>();
    const duplicateEmails = new Set<string>();
    const validRows: any[] = [];

    // Check for existing contacts in database
    const csvEmails = rows
      .map((row: any) => row[emailColumn]?.toString().toLowerCase().trim())
      .filter(Boolean);
    
    const { data: existingContacts } = await supabase
      .from("contacts")
      .select("email")
      .eq("workspace_id", workspaceId)
      .in("email", csvEmails.map((e: string) => e.toLowerCase()));

    const existingEmailSet = new Set(
      (existingContacts || []).map((c) => c.email.toLowerCase())
    );

    // Validate each row
    rows.forEach((row: any, index: number) => {
      const rowNum = index + 1; // 1-indexed for user display
      const errors: string[] = [];
      const email = row[emailColumn]?.toString().trim();

      // Email validation
      if (!email) {
        errors.push("Missing email");
      } else {
        const emailLower = email.toLowerCase();
        if (!EMAIL_REGEX.test(emailLower)) {
          errors.push(`Invalid email format: "${email}"`);
        } else {
          // Check for duplicates within CSV
          if (emailSet.has(emailLower)) {
            errors.push(`Duplicate email in CSV: "${email}"`);
            duplicateEmails.add(emailLower);
          } else {
            emailSet.add(emailLower);
          }

          // Check for existing contact
          if (existingEmailSet.has(emailLower)) {
            errors.push(`Contact already exists: "${email}"`);
          }
        }
      }

      if (errors.length > 0) {
        validationErrors.push({
          row: rowNum,
          data: row,
          errors,
        });
      } else {
        validRows.push(row);
      }
    });

    const result: ValidationResult = {
      validRows: validRows.length,
      invalidRows: validationErrors.length,
      duplicateRows: duplicateEmails.size,
      existingDuplicates: Array.from(existingEmailSet).filter((e) =>
        csvEmails.includes(e.toLowerCase())
      ).length,
      internalDuplicates: duplicateEmails.size,
      errors: validationErrors.slice(0, 100), // Limit to first 100 errors
      sampleValid: validRows.slice(0, 10), // Sample of valid rows
    };

    return NextResponse.json({ ok: true, ...result });
  } catch (error: any) {
    console.error("Validation error:", error);
    return NextResponse.json(
      { ok: false, error: error.message || "Validation failed" },
      { status: 500 }
    );
  }
}
