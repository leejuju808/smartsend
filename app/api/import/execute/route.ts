import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { ActivityLogger } from "@/lib/activity-log";

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
    const {
      validRows,
      fieldMapping,
      tags = [],
      campaignId = null,
      filename = "import.csv",
    } = body;

    if (!Array.isArray(validRows) || validRows.length === 0) {
      return NextResponse.json({ ok: false, error: "No valid rows to import" }, { status: 400 });
    }

    if (!fieldMapping || !fieldMapping.email) {
      return NextResponse.json({ ok: false, error: "Email field mapping required" }, { status: 400 });
    }

    // Create import record
    const { data: importRecord, error: importError } = await supabase
      .from("contact_imports")
      .insert({
        workspace_id: workspaceId,
        user_id: u.user.id,
        filename,
        total_rows: validRows.length,
        status: "importing",
      })
      .select()
      .single();

    if (importError || !importRecord) {
      return NextResponse.json(
        { ok: false, error: importError?.message || "Failed to create import record" },
        { status: 500 }
      );
    }

    // Prepare contacts for bulk insert
    const contactsToInsert = validRows.map((row: any) => {
      const email = row[fieldMapping.email]?.toString().trim().toLowerCase();
      const contact: any = {
        workspace_id: workspaceId,
        email,
        tags: Array.isArray(tags) && tags.length > 0 ? tags : [],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      // Map optional fields
      if (fieldMapping.name && row[fieldMapping.name]) {
        const name = row[fieldMapping.name].toString().trim();
        // Try to split name into first/last
        const nameParts = name.split(/\s+/);
        if (nameParts.length > 1) {
          contact.first_name = nameParts[0];
          contact.last_name = nameParts.slice(1).join(" ");
        } else {
          contact.first_name = name;
        }
      } else {
        if (fieldMapping.first_name && row[fieldMapping.first_name]) {
          contact.first_name = row[fieldMapping.first_name].toString().trim();
        }
        if (fieldMapping.last_name && row[fieldMapping.last_name]) {
          contact.last_name = row[fieldMapping.last_name].toString().trim();
        }
      }

      if (fieldMapping.phone && row[fieldMapping.phone]) {
        contact.phone = row[fieldMapping.phone].toString().trim();
      }
      if (fieldMapping.address && row[fieldMapping.address]) {
        contact.address = row[fieldMapping.address].toString().trim();
      }
      if (fieldMapping.city && row[fieldMapping.city]) {
        contact.city = row[fieldMapping.city].toString().trim();
      }
      if (fieldMapping.state && row[fieldMapping.state]) {
        contact.state = row[fieldMapping.state].toString().trim();
      }
      if (fieldMapping.zip && row[fieldMapping.zip]) {
        contact.zip = row[fieldMapping.zip].toString().trim();
      }
      if (fieldMapping.company && row[fieldMapping.company]) {
        contact.company = row[fieldMapping.company].toString().trim();
      }
      if (fieldMapping.title && row[fieldMapping.title]) {
        contact.title = row[fieldMapping.title].toString().trim();
      }

      // Handle tags from CSV if present
      if (fieldMapping.tags && row[fieldMapping.tags]) {
        const csvTags = row[fieldMapping.tags]
          .toString()
          .split(/[;,]/)
          .map((t: string) => t.trim())
          .filter(Boolean);
        contact.tags = Array.from(new Set([...contact.tags, ...csvTags]));
      }

      return contact;
    });

    // Bulk insert contacts (using upsert to handle duplicates gracefully)
    const { data: insertedContacts, error: insertError } = await supabase
      .from("contacts")
      .upsert(contactsToInsert, {
        onConflict: "workspace_id,email",
        ignoreDuplicates: false,
      })
      .select("id, email");

    if (insertError) {
      // Update import record with error
      await supabase
        .from("contact_imports")
        .update({
          status: "failed",
          error: insertError.message,
        })
        .eq("id", importRecord.id);

      return NextResponse.json(
        { ok: false, error: insertError.message || "Failed to insert contacts" },
        { status: 500 }
      );
    }

    const importedCount = insertedContacts?.length || 0;
    const skippedCount = contactsToInsert.length - importedCount;

    // If campaign assignment requested, link contacts to campaign
    let campaignContactsCount = 0;
    if (campaignId && insertedContacts && insertedContacts.length > 0) {
      const campaignLinks = insertedContacts.map((contact) => ({
        campaign_id: campaignId,
        contact_id: contact.id,
      }));

      const { error: linkError } = await supabase
        .from("campaign_contacts")
        .upsert(campaignLinks, {
          onConflict: "campaign_id,contact_id",
          ignoreDuplicates: true,
        });

      if (!linkError) {
        campaignContactsCount = campaignLinks.length;
      }
    }

    // Update import record with success
    await supabase
      .from("contact_imports")
      .update({
        imported_rows: importedCount,
        skipped_rows: skippedCount,
        status: "completed",
        completed_at: new Date().toISOString(),
      })
      .eq("id", importRecord.id);

    // Log import activity
    try {
      let listName: string | null = null;
      if (campaignId) {
        const { data: campaign } = await supabase
          .from("campaigns")
          .select("name")
          .eq("id", campaignId)
          .maybeSingle();
        listName = campaign?.name || null;
      }

      await ActivityLogger.importCompleted({
        workspace_id: workspaceId,
        user_id: u.user.id,
        campaign_id: campaignId || null,
        count: importedCount,
        list_name: listName,
        filename: filename,
      });
    } catch (logError) {
      console.warn("Failed to log import activity:", logError);
    }

    return NextResponse.json({
      ok: true,
      importId: importRecord.id,
      imported: importedCount,
      skipped: skippedCount,
      campaignContacts: campaignContactsCount,
    });
  } catch (error: any) {
    console.error("Import execution error:", error);
    return NextResponse.json(
      { ok: false, error: error.message || "Import failed" },
      { status: 500 }
    );
  }
}

