// Block 12900 — SmartSend List Builder Tools v1
// GET /api/lists/[id]/contacts - Get contacts in a list
// POST /api/lists/[id]/contacts - Add contacts to a list

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = createClient();

  try {
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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
        { error: "No workspace found" },
        { status: 400 }
      );
    }

    // Verify list exists and belongs to workspace
    const { data: list } = await supabase
      .from("contact_lists")
      .select("id")
      .eq("id", params.id)
      .eq("workspace_id", workspaceId)
      .single();

    if (!list) {
      return NextResponse.json({ error: "List not found" }, { status: 404 });
    }

    // Get contacts in list
    const { data: members, error } = await supabase
      .from("contact_list_members")
      .select(
        `
        contact_id,
        created_at,
        contacts (
          id,
          email,
          first_name,
          last_name,
          company,
          city,
          state,
          tags,
          created_at
        )
      `
      )
      .eq("list_id", params.id)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error fetching list contacts:", error);
      return NextResponse.json(
        { error: "Failed to fetch contacts", details: error.message },
        { status: 500 }
      );
    }

    const contacts = (members || [])
      .map((m: any) => ({
        ...m.contacts,
        added_to_list_at: m.created_at,
      }))
      .filter((c: any) => c.id); // Filter out null contacts

    return NextResponse.json({ contacts });
  } catch (err: any) {
    console.error("GET /api/lists/[id]/contacts error:", err);
    return NextResponse.json(
      { error: "Internal server error", details: err?.message || String(err) },
      { status: 500 }
    );
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = createClient();

  try {
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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
        { error: "No workspace found" },
        { status: 400 }
      );
    }

    const body = await req.json();
    const { contact_ids, tags } = body as {
      contact_ids: string[];
      tags?: string[];
    };

    if (!contact_ids || !Array.isArray(contact_ids) || contact_ids.length === 0) {
      return NextResponse.json(
        { error: "contact_ids array is required" },
        { status: 400 }
      );
    }

    // Verify list exists
    const { data: list } = await supabase
      .from("contact_lists")
      .select("id")
      .eq("id", params.id)
      .eq("workspace_id", workspaceId)
      .single();

    if (!list) {
      return NextResponse.json({ error: "List not found" }, { status: 404 });
    }

    // Add contacts to list (upsert to handle duplicates)
    const membersToInsert = contact_ids.map((contact_id) => ({
      workspace_id: workspaceId,
      list_id: params.id,
      contact_id,
    }));

    const { error: insertError } = await supabase
      .from("contact_list_members")
      .upsert(membersToInsert, { onConflict: "list_id,contact_id" });

    if (insertError) {
      console.error("Error adding contacts to list:", insertError);
      return NextResponse.json(
        { error: "Failed to add contacts", details: insertError.message },
        { status: 500 }
      );
    }

    // Update contact tags if provided
    if (tags && tags.length > 0) {
      for (const contact_id of contact_ids) {
        const { data: contact } = await supabase
          .from("contacts")
          .select("tags")
          .eq("id", contact_id)
          .single();

        if (contact) {
          const existingTags = (contact.tags || []) as string[];
          const newTags = [...new Set([...existingTags, ...tags])];
          await supabase
            .from("contacts")
            .update({ tags: newTags })
            .eq("id", contact_id);
        }
      }
    }

    return NextResponse.json({
      success: true,
      added_count: contact_ids.length,
    });
  } catch (err: any) {
    console.error("POST /api/lists/[id]/contacts error:", err);
    return NextResponse.json(
      { error: "Internal server error", details: err?.message || String(err) },
      { status: 500 }
    );
  }
}





















































