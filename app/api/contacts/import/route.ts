// Block 10800 — SmartSend Roofing Contact Loader v1
// POST /api/contacts/import
// Import contacts via CSV, manual paste, or single contact

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import Papa from "papaparse";

type ContactRow = {
  email: string;
  first_name?: string;
  last_name?: string;
  street?: string;
  city?: string;
  state?: string;
  zip?: string;
};

export async function POST(req: NextRequest) {
  const supabase = createClient();

  try {
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { contacts, listName, listId } = body as {
      contacts: ContactRow[];
      listName?: string;
      listId?: string;
    };

    if (!contacts || !Array.isArray(contacts) || contacts.length === 0) {
      return NextResponse.json(
        { error: "Contacts array is required and must not be empty" },
        { status: 400 }
      );
    }

    // Validate emails
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const validContacts: ContactRow[] = [];
    const errors: Array<{ row: number; email: string; error: string }> = [];

    contacts.forEach((contact, index) => {
      if (!contact.email || !contact.email.trim()) {
        errors.push({
          row: index + 1,
          email: contact.email || "",
          error: "Email is required",
        });
        return;
      }

      const email = contact.email.trim().toLowerCase();
      if (!emailRegex.test(email)) {
        errors.push({
          row: index + 1,
          email,
          error: "Invalid email format",
        });
        return;
      }

      validContacts.push({
        email,
        first_name: contact.first_name?.trim() || undefined,
        last_name: contact.last_name?.trim() || undefined,
        street: contact.street?.trim() || undefined,
        city: contact.city?.trim() || undefined,
        state: contact.state?.trim() || undefined,
        zip: contact.zip?.trim() || undefined,
      });
    });

    if (validContacts.length === 0) {
      return NextResponse.json(
        {
          error: "No valid contacts to import",
          errors,
        },
        { status: 400 }
      );
    }

    // Upsert contacts (insert or update if exists)
    const contactsToInsert = validContacts.map((c) => ({
      user_id: user.id,
      email: c.email,
      first_name: c.first_name || null,
      last_name: c.last_name || null,
      street: c.street || null,
      city: c.city || null,
      state: c.state || null,
      zip: c.zip || null,
    }));

    const { data: insertedContacts, error: insertError } = await supabase
      .from("contacts")
      .upsert(contactsToInsert, {
        onConflict: "user_id,email",
        ignoreDuplicates: false,
      })
      .select("id, email");

    if (insertError) {
      console.error("Error inserting contacts:", insertError);
      return NextResponse.json(
        { error: "Failed to import contacts", details: insertError.message },
        { status: 500 }
      );
    }

    // Handle list assignment
    let finalListId = listId;
    if (listName && !listId) {
      // Create new list
      const { data: newList, error: listError } = await supabase
        .from("lists")
        .insert({
          user_id: user.id,
          name: listName,
          description: null,
        })
        .select("id")
        .single();

      if (listError) {
        console.error("Error creating list:", listError);
        return NextResponse.json(
          { error: "Failed to create list", details: listError.message },
          { status: 500 }
        );
      }

      finalListId = newList.id;
    }

    // Add contacts to list if listId is provided
    if (finalListId && insertedContacts) {
      const listContacts = insertedContacts.map((contact) => ({
        list_id: finalListId,
        contact_id: contact.id,
      }));

      const { error: listContactsError } = await supabase
        .from("list_contacts")
        .upsert(listContacts, {
          onConflict: "list_id,contact_id",
          ignoreDuplicates: true,
        });

      if (listContactsError) {
        console.error("Error adding contacts to list:", listContactsError);
        // Don't fail the whole import, just log the error
      }
    }

    return NextResponse.json(
      {
        success: true,
        inserted: insertedContacts?.length || 0,
        errors: errors.length > 0 ? errors : undefined,
        listId: finalListId,
      },
      { status: 200 }
    );
  } catch (err: any) {
    console.error("POST /api/contacts/import error:", err);
    return NextResponse.json(
      { error: "Internal server error", details: err?.message || String(err) },
      { status: 500 }
    );
  }
}

// Helper function to parse CSV text
export async function parseCSV(csvText: string): Promise<ContactRow[]> {
  return new Promise((resolve, reject) => {
    Papa.parse<ContactRow>(csvText, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (header) => {
        // Normalize header names
        const normalized = header.trim().toLowerCase();
        const mapping: Record<string, string> = {
          email: "email",
          "e-mail": "email",
          "work_email": "email",
          first_name: "first_name",
          "first name": "first_name",
          firstname: "first_name",
          last_name: "last_name",
          "last name": "last_name",
          lastname: "last_name",
          street: "street",
          address: "street",
          city: "city",
          state: "state",
          zip: "zip",
          "zip code": "zip",
          zipcode: "zip",
        };
        return mapping[normalized] || normalized;
      },
      complete: (results) => {
        resolve(results.data);
      },
      error: (error) => {
        reject(error);
      },
    });
  });
}
