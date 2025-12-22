import { NextRequest, NextResponse } from "next/server";
import { getUserAndWorkspace } from "@/lib/api-helpers";
import { processCSVImport } from "@/lib/csv_import";
import { recordEvent } from "@/lib/events";
import { enrichAndSave, EnrichmentContext } from "@/lib/contact-enrichment-service";

export async function POST(req: NextRequest) {
  try {
    const { user, supabase, workspaceId } = await getUserAndWorkspace();
    const userId = user.id;

    // Parse multipart form data
    const formData = await req.formData();
    const file = formData.get("file") as File;
    const addTag = formData.get("addTag") as string;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    // Parse CSV content
    const csvText = await file.text();
    
    // Get existing emails for deduplication
    const { data: existingContacts } = await supabase
      .from("contacts")
      .select("email")
      .eq("workspace_id", workspaceId);

    const existingEmails = (existingContacts || []).map(c => c.email);

    // Get suppressed emails
    const { data: suppressed } = await supabase
      .from("suppressions")
      .select("value_lower")
      .eq("workspace_id", workspaceId)
      .eq("kind", "email");

    const suppressedEmails = (suppressed || []).map(s => s.value_lower);

    // Process CSV import
    const { result, contactsToInsert } = await processCSVImport(
      csvText,
      userId,
      addTag,
      existingEmails,
      suppressedEmails
    );

    // Add workspace_id to all contacts
    const contactsWithWorkspace = contactsToInsert.map(contact => ({
      ...contact,
      workspace_id: workspaceId
    }));

    // Insert contacts in chunks for better performance
    let inserted = 0;
    const chunkSize = 500;
    
    for (let i = 0; i < contactsWithWorkspace.length; i += chunkSize) {
      const chunk = contactsWithWorkspace.slice(i, i + chunkSize);
      const { error } = await supabase
        .from("contacts")
        .insert(chunk);
      
      if (error) {
        console.error("Insert error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      inserted += chunk.length;
    }

    // Update the result with actual inserted count
    result.inserted = inserted;

    // Auto-merge exact duplicates after import
    try {
      const { data: autoMergeResult, error: autoMergeError } = await supabase.rpc(
        "auto_merge_exact_duplicates",
        { p_workspace_id: workspaceId }
      );
      if (autoMergeError) {
        console.warn("Auto-merge after import failed:", autoMergeError);
      } else {
        console.log(`Auto-merged ${autoMergeResult || 0} duplicate contacts after import`);
      }
    } catch (e) {
      console.warn("Auto-merge error:", e);
    }

    // Record contacts import event
    await recordEvent(userId, "contacts_imported", { 
      count: inserted,
      total_in_file: result.total_in_file,
      duplicates_skipped: result.duplicates_in_file
    });

    // Increment trial counters if user is trialing
    try {
      const { data: prof } = await supabase
        .from("profiles")
        .select("subscription_status")
        .eq("id", userId)
        .maybeSingle();
      
      if (prof?.subscription_status === "trialing") {
        await supabase.rpc("increment_trial_contacts", { uid: userId, n: inserted });
      }
    } catch (error) {
      // Don't fail the import if trial counting fails
      console.warn('Trial counting error:', error);
    }

    // Mark onboarding step as complete
    try {
      const { data, error } = await supabase.rpc("merge_onboarding_step", {
        uid: userId,
        k: "import_contacts",
      });
      if (error) {
        console.warn('Failed to update onboarding step:', error);
      }
    } catch (e) {
      // Don't fail the import if onboarding update fails
      console.warn('Failed to update onboarding step:', e);
    }

    // Block 13400: Trigger enrichment for imported contacts (async, non-blocking)
    try {
      // Get workspace service area for enrichment context
      const { data: workspaceProfile } = await supabase
        .from('workspace_profile')
        .select('service_areas')
        .eq('workspace_id', workspaceId)
        .maybeSingle();
      
      const serviceArea = workspaceProfile?.service_areas || [];
      
      // Get inserted contact IDs for enrichment
      const { data: insertedContacts } = await supabase
        .from('contacts')
        .select('id, email, first_name, last_name, city, postal_code, state, tags')
        .eq('workspace_id', workspaceId)
        .in('email', contactsWithWorkspace.map(c => c.email))
        .limit(1000); // Limit to prevent timeout
      
      if (insertedContacts && insertedContacts.length > 0) {
        // Enrich contacts asynchronously (don't block response)
        Promise.all(
          insertedContacts.map(async (contact) => {
            try {
              const context: EnrichmentContext = {
                email: contact.email,
                existingFirstName: contact.first_name || undefined,
                existingLastName: contact.last_name || undefined,
                existingCity: contact.city || undefined,
                existingZip: contact.postal_code || undefined,
                existingState: contact.state || undefined,
                existingTags: contact.tags || [],
                workspaceId: workspaceId,
                serviceArea: serviceArea
              };
              
              await enrichAndSave(contact.id, context, supabase);
            } catch (error) {
              console.error(`Failed to enrich contact ${contact.id}:`, error);
              // Don't throw - enrichment failures shouldn't break import
            }
          })
        ).catch((error) => {
          console.error('Batch enrichment error:', error);
        });
      }
    } catch (e) {
      // Don't fail the import if enrichment fails
      console.warn('Enrichment trigger error:', e);
    }

    return NextResponse.json(result);

  } catch (e: any) {
    console.error("Enhanced import error:", e);
    return NextResponse.json({ error: e?.message || "Import failed" }, { status: 500 });
  }
} 