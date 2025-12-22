// Block 11000 — Contact Tagging API
// POST /api/contacts/[id]/tags - Add tag(s) to contact
// DELETE /api/contacts/[id]/tags/[tag] - Remove tag from contact

import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import { getCurrentWorkspaceId } from "@/src/lib/workspace";

// POST /api/contacts/[id]/tags - Add tag(s) to contact
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const workspaceId = await getCurrentWorkspaceId();
    if (!workspaceId) {
      return NextResponse.json({ error: "No workspace found" }, { status: 400 });
    }

    const { id } = await params;

    // Verify contact exists and belongs to workspace
    const { data: contact, error: contactError } = await supabase
      .from("contacts")
      .select("id, workspace_id")
      .eq("id", id)
      .eq("workspace_id", workspaceId)
      .single();

    if (contactError || !contact) {
      return NextResponse.json(
        { error: "Contact not found" },
        { status: 404 }
      );
    }

    const body = await req.json();
    const { tags } = body;

    if (!tags || !Array.isArray(tags) || tags.length === 0) {
      return NextResponse.json(
        { error: "Tags array is required" },
        { status: 400 }
      );
    }

    // Add tags using the add_contact_tag function
    for (const tag of tags) {
      if (typeof tag !== "string" || tag.trim().length === 0) {
        continue;
      }

      const normalizedTag = tag.trim().toLowerCase();

      // Add tag to contact
      const { error: addError } = await supabase.rpc("add_contact_tag", {
        p_workspace_id: workspaceId,
        p_contact_id: id,
        p_tag: normalizedTag,
        p_auto_tagged: false,
        p_created_by: user.id,
      });

      if (addError) {
        console.error(`Error adding tag ${normalizedTag}:`, addError);
        // Continue with other tags even if one fails
      }
    }

    // Fetch updated tags
    const { data: contactTags, error: tagsError } = await supabase
      .from("contact_tags")
      .select("tag")
      .eq("workspace_id", workspaceId)
      .eq("contact_id", id);

    if (tagsError) {
      console.error("Error fetching contact tags:", tagsError);
    }

    return NextResponse.json({
      success: true,
      tags: contactTags?.map((ct) => ct.tag) || [],
    });
  } catch (error: any) {
    console.error("Error in POST /api/contacts/[id]/tags:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

// DELETE /api/contacts/[id]/tags/[tag] - Remove tag from contact
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; tag: string }> }
) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const workspaceId = await getCurrentWorkspaceId();
    if (!workspaceId) {
      return NextResponse.json({ error: "No workspace found" }, { status: 400 });
    }

    const { id, tag } = await params;

    // Verify contact exists and belongs to workspace
    const { data: contact, error: contactError } = await supabase
      .from("contacts")
      .select("id, workspace_id")
      .eq("id", id)
      .eq("workspace_id", workspaceId)
      .single();

    if (contactError || !contact) {
      return NextResponse.json(
        { error: "Contact not found" },
        { status: 404 }
      );
    }

    // Remove tag using the remove_contact_tag function
    const { error } = await supabase.rpc("remove_contact_tag", {
      p_workspace_id: workspaceId,
      p_contact_id: id,
      p_tag: tag,
    });

    if (error) {
      console.error("Error removing tag:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Log tag removal event
    await supabase.rpc("log_tag_event", {
      p_workspace_id: workspaceId,
      p_contact_id: id,
      p_event_type: "tag_removed",
      p_tag: tag,
      p_auto_tagged: false,
    }).catch(() => {
      // Ignore logging errors
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Error in DELETE /api/contacts/[id]/tags/[tag]:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
