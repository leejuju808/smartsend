// Block 11000 — Step 3: Import Starter List API
// POST /api/onboarding/step-3-contacts

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  const supabase = createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { contacts, listName } = body;

    if (!contacts || !Array.isArray(contacts) || contacts.length === 0) {
      return NextResponse.json(
        { error: "Missing or empty contacts array" },
        { status: 400 }
      );
    }

    // Get user's workspace
    const { data: membership } = await supabase
      .from("workspace_members")
      .select("workspace_id")
      .eq("user_id", user.id)
      .limit(1)
      .maybeSingle();

    const workspaceId = membership?.workspace_id;

    if (!workspaceId) {
      return NextResponse.json(
        { error: "No workspace found for user" },
        { status: 400 }
      );
    }

    // Create "Old Quotes" list (or use provided listName)
    const listNameToUse = listName || "Old Quotes";
    const { data: contactList, error: listError } = await supabase
      .from("contact_lists")
      .insert({
        workspace_id: workspaceId,
        name: listNameToUse,
        description: "Imported during onboarding",
      })
      .select()
      .single();

    if (listError) {
      // List might already exist, try to get it
      const { data: existingList } = await supabase
        .from("contact_lists")
        .select()
        .eq("workspace_id", workspaceId)
        .eq("name", listNameToUse)
        .single();

      if (existingList) {
        // Use existing list
        const insertedContacts = await insertContacts(
          supabase,
          workspaceId,
          contacts,
          existingList.id
        );
        return NextResponse.json({
          success: true,
          listId: existingList.id,
          listName: existingList.name,
          contactsImported: insertedContacts.length,
          message: `Imported ${insertedContacts.length} contacts into ${existingList.name}`,
        });
      }

      console.error("Error creating contact list:", listError);
      return NextResponse.json(
        { error: "Failed to create contact list" },
        { status: 500 }
      );
    }

    // Insert contacts
    const insertedContacts = await insertContacts(
      supabase,
      workspaceId,
      contacts,
      contactList.id
    );

    // Update onboarding status
    const { error: updateError } = await supabase
      .from("onboarding_status")
      .update({ step_3_done: true })
      .eq("user_id", user.id);

    if (updateError) {
      console.error("Error updating onboarding status:", updateError);
    }

    return NextResponse.json(
      {
        success: true,
        listId: contactList.id,
        listName: contactList.name,
        contactsImported: insertedContacts.length,
        message: `Imported ${insertedContacts.length} contacts into ${listNameToUse}`,
      },
      { status: 200 }
    );
  } catch (error: any) {
    console.error("Error in step-3-contacts:", error);
    return NextResponse.json(
      { error: "Internal server error", details: error.message },
      { status: 500 }
    );
  }
}

// Helper function to insert contacts
async function insertContacts(
  supabase: any,
  workspaceId: string,
  contacts: Array<{ email: string; firstName?: string; lastName?: string; [key: string]: any }>,
  listId: string
): Promise<any[]> {
  const inserted: any[] = [];
  const errors: any[] = [];

  for (const contact of contacts) {
    if (!contact.email) {
      errors.push({ contact, error: "Missing email" });
      continue;
    }

    // Insert or update contact
    const { data: contactData, error: contactError } = await supabase
      .from("contacts")
      .upsert(
        {
          workspace_id: workspaceId,
          email: contact.email.toLowerCase().trim(),
          first_name: contact.firstName || contact.first_name || null,
          last_name: contact.lastName || contact.last_name || null,
          source: "onboarding_import",
        },
        {
          onConflict: "workspace_id,email",
        }
      )
      .select()
      .single();

    if (contactError) {
      errors.push({ contact, error: contactError.message });
      continue;
    }

    // Add to list
    await supabase
      .from("contact_list_members")
      .insert({
        list_id: listId,
        contact_id: contactData.id,
      })
      .on("CONFLICT (list_id, contact_id) DO NOTHING");

    inserted.push(contactData);
  }

  if (errors.length > 0) {
    console.warn("Some contacts failed to import:", errors);
  }

  return inserted;
}























































