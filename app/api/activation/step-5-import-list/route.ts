import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * POST /api/activation/step-5-import-list
 * 
 * Step 5: Import Homeowner List
 * Two options:
 * A. Customer sends you CSV - You upload
 * B. Customer gives you CRM login or screenshot - You recreate manually or import if possible
 * 
 * This endpoint handles CSV uploads. For manual imports, use the existing contacts import API.
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const {
      workspace_id,
      import_method, // 'csv' | 'crm' | 'manual'
      contacts_data, // Array of contact objects for CSV import
      contacts_count, // Number of contacts imported
    } = body;

    if (!workspace_id || !import_method) {
      return NextResponse.json(
        { error: "Missing required fields: workspace_id, import_method" },
        { status: 400 }
      );
    }

    if (!["csv", "crm", "manual"].includes(import_method)) {
      return NextResponse.json(
        { error: "Invalid import_method. Must be csv, crm, or manual" },
        { status: 400 }
      );
    }

    // Get activation state
    const { data: activationState, error: activationError } = await supabase
      .from("roofer_activation_state")
      .select("*")
      .eq("workspace_id", workspace_id)
      .single();

    if (activationError || !activationState) {
      return NextResponse.json(
        { error: "Activation state not found. Complete steps 1-4 first." },
        { status: 404 }
      );
    }

    let importedCount = contacts_count || 0;

    // If CSV data provided, import contacts
    if (import_method === "csv" && contacts_data && Array.isArray(contacts_data)) {
      // Use existing contacts import logic
      const contactsToInsert = contacts_data.map((contact: any) => ({
        workspace_id,
        email: contact.email?.toLowerCase().trim(),
        first_name: contact.first_name || contact.firstname || "",
        last_name: contact.last_name || contact.lastname || "",
        phone: contact.phone || "",
        city: contact.city || activationState.primary_city || "",
        state: contact.state || "",
        zip: contact.zip || "",
        notes: contact.notes || "",
      })).filter((c: any) => c.email); // Filter out contacts without email

      if (contactsToInsert.length > 0) {
        // Insert contacts in batches
        const batchSize = 500;
        for (let i = 0; i < contactsToInsert.length; i += batchSize) {
          const batch = contactsToInsert.slice(i, i + batchSize);
          const { error: insertError } = await supabase
            .from("contacts")
            .upsert(batch, {
              onConflict: "workspace_id,email",
              ignoreDuplicates: false,
            });

          if (insertError) {
            console.error("Error inserting contacts batch:", insertError);
          }
        }

        importedCount = contactsToInsert.length;

        // Create or get "Homeowners List"
        let { data: homeownersList } = await supabase
          .from("contact_lists")
          .select("id")
          .eq("workspace_id", workspace_id)
          .eq("name", "Homeowners List")
          .maybeSingle();

        if (!homeownersList) {
          const { data: newList, error: listError } = await supabase
            .from("contact_lists")
            .insert({
              workspace_id,
              name: "Homeowners List",
              description: "Default list created during activation",
            })
            .select()
            .single();

          if (listError) {
            console.error("Error creating homeowners list:", listError);
          } else {
            homeownersList = newList;
          }
        }

        // Add contacts to list
        if (homeownersList) {
          const { data: insertedContacts } = await supabase
            .from("contacts")
            .select("id")
            .eq("workspace_id", workspace_id)
            .in("email", contactsToInsert.map((c: any) => c.email));

          if (insertedContacts && insertedContacts.length > 0) {
            const listMembers = insertedContacts.map((contact) => ({
              list_id: homeownersList!.id,
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
      }
    }

    // Update activation state
    const { error: step5Error } = await supabase
      .from("roofer_activation_state")
      .update({
        list_imported_at: new Date().toISOString(),
        contacts_imported_count: importedCount,
        import_method,
        step_completed: 5,
      })
      .eq("id", activationState.id);

    if (step5Error) {
      return NextResponse.json(
        { error: "Failed to update step 5" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      step_completed: 5,
      import_summary: {
        import_method,
        contacts_imported_count: importedCount,
      },
      message: "Most roofers have messy CRM exports and no idea how to clean lists. SmartSend makes it easy → they see immediate value.",
    });
  } catch (error: any) {
    console.error("Error in step-5-import-list:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}






































