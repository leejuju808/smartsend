// Block 21675 — Onboarding Import Leads API
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { parse } from "csv-parse/sync";

function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

export async function POST(req: NextRequest) {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  // Get user's workspace
  const { data: membership } = await supabase
    .from("workspace_members")
    .select("workspace_id")
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle();

  if (!membership) {
    return NextResponse.json(
      { error: "No workspace found" },
      { status: 400 }
    );
  }

  const workspaceId = membership.workspace_id;

  const formData = await req.formData();
  const file = formData.get("file") as File | null;

  if (!file) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }

  try {
    const text = await file.text();
    const records: any[] = parse(text, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
    });

    if (records.length === 0) {
      return NextResponse.json({ error: "Empty CSV" }, { status: 400 });
    }

    // Map CSV columns to contact fields (auto-detect common column names)
    const contacts = records
      .map((row) => {
        const email =
          row.email ||
          row.Email ||
          row.EMAIL ||
          row["email address"] ||
          row["Email Address"];
        const firstName =
          row.first_name ||
          row["First Name"] ||
          row["first name"] ||
          row.firstName ||
          row.FirstName;
        const lastName =
          row.last_name ||
          row["Last Name"] ||
          row["last name"] ||
          row.lastName ||
          row.LastName;
        const city = row.city || row.City || row.CITY;
        const state = row.state || row.State || row.STATE;

        return {
          email: email?.toLowerCase().trim(),
          first_name: firstName?.trim() || null,
          last_name: lastName?.trim() || null,
          city: city?.trim() || null,
          state: state?.trim() || null,
        };
      })
      .filter((c) => c.email && isValidEmail(c.email));

    if (contacts.length === 0) {
      return NextResponse.json(
        { error: "No valid email addresses found in CSV" },
        { status: 400 }
      );
    }

    // Insert contacts
    const contactsToInsert = contacts.map((c) => ({
      workspace_id: workspaceId,
      email: c.email,
      first_name: c.first_name,
      last_name: c.last_name,
      city: c.city,
      state: c.state,
      source: "onboarding_import",
    }));

    const { data: insertedContacts, error: insertError } = await supabase
      .from("contacts")
      .upsert(contactsToInsert, {
        onConflict: "workspace_id,email",
        ignoreDuplicates: false,
      })
      .select();

    if (insertError) {
      console.error("Error inserting contacts:", insertError);
      return NextResponse.json(
        { error: "Failed to import contacts" },
        { status: 500 }
      );
    }

    // Get or create "Homeowners List"
    let { data: homeownersList } = await supabase
      .from("contact_lists")
      .select("id")
      .eq("workspace_id", workspaceId)
      .eq("name", "Homeowners List")
      .maybeSingle();

    if (!homeownersList) {
      const { data: newList, error: listError } = await supabase
        .from("contact_lists")
        .insert({
          workspace_id: workspaceId,
          name: "Homeowners List",
          description: "Default list created during onboarding",
        })
        .select()
        .single();

      if (listError) {
        console.error("Error creating homeowners list:", listError);
        return NextResponse.json(
          { error: "Failed to create homeowners list" },
          { status: 500 }
        );
      }
      homeownersList = newList;
    }

    // Add contacts to list
    const listMembers = (insertedContacts || []).map((contact) => ({
      list_id: homeownersList!.id,
      contact_id: contact.id,
    }));

    if (listMembers.length > 0) {
      const { error: membersError } = await supabase
        .from("contact_list_members")
        .upsert(listMembers, {
          onConflict: "list_id,contact_id",
          ignoreDuplicates: true,
        });

      if (membersError) {
        console.error("Error adding contacts to list:", membersError);
        // Don't fail the request, just log
      }
    }

    return NextResponse.json({
      success: true,
      contacts_imported: insertedContacts?.length || 0,
      list_id: homeownersList.id,
    });
  } catch (error: any) {
    console.error("Error processing CSV:", error);
    return NextResponse.json(
      { error: error.message || "Failed to process CSV" },
      { status: 500 }
    );
  }
}
