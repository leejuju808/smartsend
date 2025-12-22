/**
 * Contact Import Integration
 * 
 * Handles contact imports from:
 * - CSV/Excel (Manual Uploads)
 * - QuickBooks Customer Export
 * - Phone Contacts Import (Mobile App)
 * 
 * Roofers' #1 problem: Their lists are scattered everywhere.
 * SmartSend solves this by importing from anywhere.
 */

import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";

export async function POST(req: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const formData = await req.formData();
    const file = formData.get("file") as File;
    const integration_id = formData.get("integration_id") as string;
    const workspace_id = formData.get("workspace_id") as string;
    const import_type = formData.get("import_type") as string || "csv"; // 'csv', 'quickbooks', 'phone_contacts'

    if (!file || !integration_id || !workspace_id) {
      return NextResponse.json(
        { error: "Missing required fields: file, integration_id, workspace_id" },
        { status: 400 }
      );
    }

    // Create import job
    const { data: importJob, error: jobError } = await supabase
      .from("contact_import_jobs")
      .insert({
        integration_id,
        workspace_id,
        status: "processing",
        file_name: file.name,
        file_size_bytes: file.size,
        started_at: new Date().toISOString()
      })
      .select("id")
      .single();

    if (jobError || !importJob) {
      return NextResponse.json(
        { error: "Failed to create import job" },
        { status: 500 }
      );
    }

    // Parse file based on type
    const fileText = await file.text();
    let contacts: any[] = [];

    if (import_type === "csv" || file.name.endsWith(".csv")) {
      contacts = parseCSV(fileText);
    } else if (import_type === "quickbooks" || file.name.includes("quickbooks")) {
      contacts = parseQuickBooks(fileText);
    } else if (import_type === "phone_contacts") {
      // Phone contacts would be JSON format
      contacts = JSON.parse(fileText);
    } else {
      // Try CSV as default
      contacts = parseCSV(fileText);
    }

    let importedCount = 0;
    let skippedCount = 0;
    let errorCount = 0;
    const errors: any[] = [];

    // Process each contact
    for (let i = 0; i < contacts.length; i++) {
      const contact = contacts[i];
      try {
        const email = contact.email || contact.Email || contact.email_address;
        if (!email) {
          skippedCount++;
          continue;
        }

        // Process lead through unified processing
        const processResponse = await fetch(
          `${req.nextUrl.origin}/api/integrations/roofing/process-lead`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Cookie": req.headers.get("cookie") || ""
            },
            body: JSON.stringify({
              integration_id,
              workspace_id,
              email,
              first_name: contact.first_name || contact.firstName || contact.FirstName,
              last_name: contact.last_name || contact.lastName || contact.LastName,
              phone: contact.phone || contact.Phone || contact.phone_number,
              source_type: "import",
              metadata: {
                import_type,
                import_job_id: importJob.id,
                row_number: i + 1,
                raw_data: contact
              }
            })
          }
        );

        if (!processResponse.ok) {
          errorCount++;
          const error = await processResponse.json();
          errors.push({ row: i + 1, error: error.message || "Processing failed" });
        } else {
          importedCount++;
        }
      } catch (error) {
        errorCount++;
        errors.push({
          row: i + 1,
          error: error instanceof Error ? error.message : "Unknown error"
        });
      }
    }

    // Update import job status
    await supabase
      .from("contact_import_jobs")
      .update({
        status: errorCount === contacts.length ? "failed" : "completed",
        total_rows: contacts.length,
        imported_count: importedCount,
        skipped_count: skippedCount,
        error_count: errorCount,
        error_message: errorCount > 0 ? `${errorCount} errors during import` : null,
        error_details: errors.length > 0 ? errors : null,
        completed_at: new Date().toISOString()
      })
      .eq("id", importJob.id);

    return NextResponse.json({
      success: true,
      import_job_id: importJob.id,
      total_rows: contacts.length,
      imported: importedCount,
      skipped: skippedCount,
      errors: errorCount,
      error_details: errors.length > 0 ? errors : undefined
    });

  } catch (error) {
    console.error("Error importing contacts:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}

// Helper function to parse CSV
function parseCSV(csvText: string): any[] {
  const lines = csvText.split("\n").filter(line => line.trim());
  if (lines.length === 0) return [];

  // Parse header
  const headers = lines[0].split(",").map(h => h.trim().replace(/^"|"$/g, ""));
  
  // Parse rows
  const contacts = [];
  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(",").map(v => v.trim().replace(/^"|"$/g, ""));
    const contact: any = {};
    headers.forEach((header, index) => {
      contact[header] = values[index] || "";
    });
    contacts.push(contact);
  }
  
  return contacts;
}

// Helper function to parse QuickBooks export format
function parseQuickBooks(text: string): any[] {
  // QuickBooks exports are typically CSV with specific column names
  // This is a simplified parser - adjust based on actual QuickBooks export format
  return parseCSV(text);
}






































