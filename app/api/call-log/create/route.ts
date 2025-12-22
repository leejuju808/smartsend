// Block 13100 — Direct Call Log + Phone Activity Tracking v1
// POST /api/call-log/create
// Create a new call log entry

import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabaseServer";
import { getCurrentOrgId } from "@/lib/org-helpers";

interface CreateCallLogInput {
  contactId?: string | null;
  phone: string;
  direction: "inbound" | "outbound";
  outcome: string;
  notes?: string;
  followUpAt?: string;
}

export async function POST(req: NextRequest) {
  try {
    const supabase = createSupabaseServer();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await req.json()) as CreateCallLogInput;

    // Validate required fields
    if (!body.phone || !body.direction || !body.outcome) {
      return NextResponse.json(
        { error: "Missing required fields: phone, direction, outcome" },
        { status: 400 }
      );
    }

    // Validate direction
    if (!["inbound", "outbound"].includes(body.direction)) {
      return NextResponse.json(
        { error: "Invalid direction. Must be 'inbound' or 'outbound'" },
        { status: 400 }
      );
    }

    // Get current org_id
    const orgId = await getCurrentOrgId();
    if (!orgId) {
      return NextResponse.json({ error: "No organization found" }, { status: 400 });
    }

    // Auto-match contact by phone if contactId not provided (for inbound calls)
    let contactId = body.contactId || null;
    if (!contactId && body.direction === "inbound") {
      const { data: matchedContactId } = await supabase.rpc("find_contact_by_phone", {
        p_org_id: orgId,
        p_phone: body.phone,
      });
      if (matchedContactId) {
        contactId = matchedContactId;
      }
    }

    // Verify contact belongs to org if provided
    if (contactId) {
      const { data: contact, error: contactError } = await supabase
        .from("contacts")
        .select("id, org_id")
        .eq("id", contactId)
        .single();

      if (contactError || !contact) {
        return NextResponse.json(
          { error: "Contact not found" },
          { status: 404 }
        );
      }

      // Verify contact belongs to org
      if (contact.org_id !== orgId) {
        return NextResponse.json(
          { error: "Contact does not belong to your organization" },
          { status: 403 }
        );
      }
    }

    // Create call log
    const { data: callLog, error: insertError } = await supabase
      .from("call_logs")
      .insert({
        org_id: orgId,
        contact_id: contactId,
        user_id: user.id,
        phone: body.phone,
        direction: body.direction,
        outcome: body.outcome,
        notes: body.notes || null,
        follow_up_at: body.followUpAt ? new Date(body.followUpAt).toISOString() : null,
      })
      .select("*")
      .single();

    if (insertError) {
      console.error("[Call Log] Insert error:", insertError);
      return NextResponse.json(
        { error: "Failed to create call log", details: insertError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      callLog,
    });
  } catch (error) {
    console.error("[Call Log] Unexpected error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

