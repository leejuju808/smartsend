// Block 14600 — Contact Import Commit
// POST /api/contacts/import/commit
// Processes CSV rows, inserts contacts, creates list, returns summary

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

type ColumnMapping = Record<string, string>; // csvHeader -> "first_name" | "last_name" | "email" | ...

export async function POST(req: Request) {
  const supabase = createClient();
  const body = await req.json();

  const {
    import_id,
    list_name,
    rows,
    column_mapping,
    owner_user_id, // Block 16300: Optional owner assignment for imported contacts
  }: {
    import_id: string;
    list_name: string;
    rows: any[];
    column_mapping: ColumnMapping;
    owner_user_id?: string | null;
  } = body;

  if (!import_id || !list_name || !rows?.length || !column_mapping) {
    return NextResponse.json(
      { error: "Missing import_id, list_name, rows, or column_mapping" },
      { status: 400 }
    );
  }

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Load import row + workspace
  const { data: imp, error: impError } = await supabase
    .from("contact_imports")
    .select("id, workspace_id, status")
    .eq("id", import_id)
    .single();

  if (impError || !imp) {
    return NextResponse.json({ error: "Import not found" }, { status: 404 });
  }

  if (imp.status !== "pending") {
    return NextResponse.json(
      { error: "Import already processed" },
      { status: 400 }
    );
  }

  const workspaceId = imp.workspace_id;

  // Update status to processing
  await supabase
    .from("contact_imports")
    .update({ status: "processing" })
    .eq("id", import_id);

  // Create a list for this import
  const { data: list, error: listError } = await supabase
    .from("contact_lists")
    .insert({
      workspace_id: workspaceId,
      name: list_name,
      description: "Imported from CSV",
    })
    .select("*")
    .single();

  if (listError) {
    await supabase
      .from("contact_imports")
      .update({
        status: "failed",
        error_message: listError.message,
      })
      .eq("id", import_id);
    return NextResponse.json({ error: listError.message }, { status: 400 });
  }

  let imported = 0;
  let skipped = 0;
  const contactIds: string[] = [];

  // Block 16300: Determine default owner for imported contacts
  // If owner_user_id provided, use it; otherwise default to workspace owner or current user
  let defaultOwnerId: string | null = owner_user_id || null;
  if (!defaultOwnerId) {
    // Get workspace owner as fallback
    const { data: workspaceOwner } = await supabase
      .from("workspace_members")
      .select("user_id")
      .eq("workspace_id", workspaceId)
      .eq("role", "owner")
      .limit(1)
      .single();
    defaultOwnerId = workspaceOwner?.user_id || user.id;
  }

  for (const row of rows) {
    // Map CSV row -> contact payload
    const payload: any = {
      workspace_id: workspaceId,
      owner_user_id: defaultOwnerId, // Block 16300: Assign owner to imported contacts
    };

    for (const [csvHeader, field] of Object.entries(column_mapping)) {
      const value = row[csvHeader];

      if (!value) continue;

      if (
        [
          "first_name",
          "last_name",
          "email",
          "phone",
          "city",
          "state",
          "zip",
          "notes",
        ].includes(field)
      ) {
        payload[field] = String(value).trim();
      }
    }

    // Skip if no email
    if (!payload.email) {
      skipped++;
      continue;
    }

    // Normalize email
    payload.email = payload.email.toLowerCase().trim();

    // Skip if suppressed - check global_suppressions table
    const { data: suppressed } = await supabase
      .from("global_suppressions")
      .select("id")
      .eq("workspace_id", workspaceId)
      .ilike("email", payload.email)
      .maybeSingle();

    if (suppressed) {
      skipped++;
      continue;
    }

    // Upsert contact by email (per workspace)
    const { data: contact, error: contactError } = await supabase
      .from("contacts")
      .upsert(
        {
          ...payload,
        },
        {
          onConflict: "workspace_id,email",
        }
      )
      .select("id")
      .single();

    if (contactError || !contact) {
      skipped++;
      continue;
    }

    contactIds.push(contact.id);

    // Add to list
    await supabase.from("contact_list_members").upsert(
      {
        workspace_id: workspaceId,
        list_id: list.id,
        contact_id: contact.id,
      },
      {
        onConflict: "list_id,contact_id",
      }
    );

    // Block 17900: Enrich phone intelligence if phone number exists
    if (payload.phone) {
      try {
        const { enrichContactPhone } = await import("@/lib/phone-intelligence/integration");
        // Get org_id from workspace
        const { data: workspace } = await supabase
          .from("workspaces")
          .select("org_id")
          .eq("id", workspaceId)
          .maybeSingle();
        
        if (workspace?.org_id) {
          await enrichContactPhone(
            supabase,
            contact.id,
            payload.phone,
            workspace.org_id
          );
        }
      } catch (error) {
        // Don't fail import if phone enrichment fails
        console.error("Error enriching phone intelligence:", error);
      }
    }

    imported++;
  }

  // Block 15300: Auto-tag contacts based on list type
  if (contactIds.length > 0 && list.list_type) {
    let leadSourceToApply: string | null = null;
    let sourceMetaUpdate: any = {};

    if (list.list_type === "storm") {
      leadSourceToApply = "storm_outreach";
      sourceMetaUpdate = {
        list_id: list.id,
        storm_name: list.source_tag || null,
      };
    } else if (list.list_type === "past_customers") {
      leadSourceToApply = "past_customer";
    } else if (list.list_type === "reactivation") {
      leadSourceToApply = "quote_reactivation";
    }

    if (leadSourceToApply) {
      // Get existing source_meta for each contact to merge
      const { data: existingContacts } = await supabase
        .from("contacts")
        .select("id, source_meta")
        .in("id", contactIds);

      // Update contacts with lead source and merged metadata
      for (const contact of existingContacts || []) {
        const existingMeta = (contact.source_meta as any) || {};
        await supabase
          .from("contacts")
          .update({
            lead_source: leadSourceToApply,
            source_meta: {
              ...existingMeta,
              ...sourceMetaUpdate,
            },
          })
          .eq("id", contact.id);
      }
    }
  }

  await supabase
    .from("contact_imports")
    .update({
      list_id: list.id,
      imported_rows: imported,
      skipped_rows: skipped,
      status: "completed",
      completed_at: new Date().toISOString(),
    })
    .eq("id", import_id);

  // Block 15600: Run list intelligence analysis after import
  if (imported > 0 && list.id) {
    try {
      // Call the classification function asynchronously (don't block response)
      supabase.rpc("classify_list_intelligence", { p_list_id: list.id }).then(
        (result) => {
          if (result.error) {
            console.error("List intelligence analysis error:", result.error);
          } else {
            console.log("List intelligence analyzed:", result.data);
          }
        }
      );
    } catch (err) {
      console.error("Error triggering list intelligence:", err);
      // Don't fail the import if intelligence fails
    }
  }

  // Block 15600: Auto-mark contacts_done if at least one contact was imported
  if (imported > 0) {
    const { data: currentWorkspace } = await supabase
      .from("workspaces")
      .select("onboarding_state")
      .eq("id", workspaceId)
      .single();

    const currentState = currentWorkspace?.onboarding_state || {
      profile_done: false,
      contacts_done: false,
      first_campaign_done: false,
    };

    const newState = {
      ...currentState,
      contacts_done: true,
    };

    const allDone =
      newState.profile_done &&
      newState.contacts_done &&
      newState.first_campaign_done;

    await supabase
      .from("workspaces")
      .update({
        onboarding_state: newState,
        onboarding_completed_at: allDone ? new Date().toISOString() : null,
      })
      .eq("id", workspaceId);
  }

  return NextResponse.json({
    list_id: list.id,
    imported,
    skipped,
  });
}
