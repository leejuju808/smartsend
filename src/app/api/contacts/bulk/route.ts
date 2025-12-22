// Block 9400 — Bulk Actions Engine
// POST /api/contacts/bulk - Bulk update contacts

import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";

type BulkAction =
  | { type: "status"; value: string }
  | { type: "add_tags"; tags: string[] }
  | { type: "remove_tags"; tags: string[] }
  | { type: "assign_owner"; ownerId: string }
  | { type: "suppress" }
  | { type: "delete" };

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

  const body = await req.json().catch(() => ({}));
  const { contactIds, action }: { contactIds: string[]; action: BulkAction } = body;

  if (!Array.isArray(contactIds) || contactIds.length === 0) {
    return NextResponse.json({ ok: false, error: "contactIds array required" }, { status: 400 });
  }

  if (!action || !action.type) {
    return NextResponse.json({ ok: false, error: "action required" }, { status: 400 });
  }

  // Verify all contacts belong to user's workspace (RLS check)
  const { data: contacts, error: verifyError } = await supabase
    .from("contacts")
    .select("id")
    .eq("workspace_id", workspaceId)
    .in("id", contactIds);

  if (verifyError) {
    return NextResponse.json({ ok: false, error: verifyError.message }, { status: 500 });
  }

  const validContactIds = contacts?.map((c) => c.id) || [];
  if (validContactIds.length !== contactIds.length) {
    return NextResponse.json(
      { ok: false, error: "Some contacts not found or unauthorized" },
      { status: 403 }
    );
  }

  try {
    switch (action.type) {
      case "status": {
        const { error } = await supabase
          .from("contacts")
          .update({ status: action.value, updated_at: new Date().toISOString() })
          .in("id", validContactIds);

        if (error) {
          return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
        }
        break;
      }

      case "add_tags": {
        // Get current tags for each contact
        const { data: currentContacts, error: fetchError } = await supabase
          .from("contacts")
          .select("id, tags")
          .in("id", validContactIds);

        if (fetchError) {
          return NextResponse.json({ ok: false, error: fetchError.message }, { status: 500 });
        }

        // Update each contact with merged tags
        const updates = (currentContacts || []).map((contact) => {
          const currentTags = Array.isArray(contact.tags) ? contact.tags : [];
          const newTags = Array.from(new Set([...currentTags, ...action.tags]));
          return supabase
            .from("contacts")
            .update({ tags: newTags, updated_at: new Date().toISOString() })
            .eq("id", contact.id);
        });

        const results = await Promise.all(updates);
        const hasError = results.some((r) => r.error);
        if (hasError) {
          return NextResponse.json(
            { ok: false, error: "Failed to update some contacts" },
            { status: 500 }
          );
        }
        break;
      }

      case "remove_tags": {
        // Get current tags for each contact
        const { data: currentContacts, error: fetchError } = await supabase
          .from("contacts")
          .select("id, tags")
          .in("id", validContactIds);

        if (fetchError) {
          return NextResponse.json({ ok: false, error: fetchError.message }, { status: 500 });
        }

        // Update each contact with tags removed
        const updates = (currentContacts || []).map((contact) => {
          const currentTags = Array.isArray(contact.tags) ? contact.tags : [];
          const newTags = currentTags.filter((tag) => !action.tags.includes(tag));
          return supabase
            .from("contacts")
            .update({ tags: newTags, updated_at: new Date().toISOString() })
            .eq("id", contact.id);
        });

        const results = await Promise.all(updates);
        const hasError = results.some((r) => r.error);
        if (hasError) {
          return NextResponse.json(
            { ok: false, error: "Failed to update some contacts" },
            { status: 500 }
          );
        }
        break;
      }

      case "assign_owner": {
        const { error } = await supabase
          .from("contacts")
          .update({ owner_id: action.ownerId, updated_at: new Date().toISOString() })
          .in("id", validContactIds);

        if (error) {
          return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
        }
        break;
      }

      case "suppress": {
        // Add emails to suppression_list
        const { data: contactEmails } = await supabase
          .from("contacts")
          .select("email")
          .in("id", validContactIds);

        if (contactEmails && contactEmails.length > 0) {
          const suppressionEntries = contactEmails.map((c) => ({
            workspace_id: workspaceId,
            email: c.email,
            reason: "manual",
            source: "bulk_action",
          }));

          // Use upsert to avoid conflicts
          const { error: suppressError } = await supabase
            .from("suppression_emails")
            .upsert(suppressionEntries, { onConflict: "workspace_id,email" });

          if (suppressError) {
            return NextResponse.json(
              { ok: false, error: suppressError.message },
              { status: 500 }
            );
          }
        }
        break;
      }

      case "delete": {
        const { error } = await supabase.from("contacts").delete().in("id", validContactIds);

        if (error) {
          return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
        }
        break;
      }

      default:
        return NextResponse.json({ ok: false, error: "Invalid action type" }, { status: 400 });
    }

    return NextResponse.json({ ok: true, updated: validContactIds.length });
  } catch (error: any) {
    console.error("Bulk action error:", error);
    return NextResponse.json({ ok: false, error: error.message || "Unknown error" }, { status: 500 });
  }
}
