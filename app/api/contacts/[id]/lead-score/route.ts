/**
 * Block 13800 — Lead Score Engine API
 * Endpoints for managing contact lead scores
 */

import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import {
  updateContactLeadScore,
  recalculateContactLeadScore,
  getLeadScoreEvents,
} from "@/lib/lead-scoring/contact-lead-score";

/**
 * GET /api/contacts/[id]/lead-score
 * Get contact lead score and events
 */
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const contactId = params.id;

    // Get contact with score
    const { data: contact, error: contactError } = await supabase
      .from("contacts")
      .select("id, email, lead_score, lead_score_last_updated, workspace_id")
      .eq("id", contactId)
      .single();

    if (contactError || !contact) {
      return NextResponse.json(
        { error: "Contact not found" },
        { status: 404 }
      );
    }

    // Get score events
    const events = await getLeadScoreEvents(supabase, contactId, 20);

    return NextResponse.json({
      contact_id: contact.id,
      score: contact.lead_score || 0,
      last_updated: contact.lead_score_last_updated,
      events,
    });
  } catch (error: any) {
    console.error("Error getting lead score:", error);
    return NextResponse.json(
      { error: error.message || "Failed to get lead score" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/contacts/[id]/lead-score
 * Recalculate and update contact lead score
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const contactId = params.id;
    const body = await req.json();
    const { reason = "manual_recalculation", event_id, metadata } = body;

    // Verify contact exists and user has access
    const { data: contact, error: contactError } = await supabase
      .from("contacts")
      .select("id, workspace_id")
      .eq("id", contactId)
      .single();

    if (contactError || !contact) {
      return NextResponse.json(
        { error: "Contact not found" },
        { status: 404 }
      );
    }

    // Recalculate score
    const result = await recalculateContactLeadScore(
      supabase,
      contactId,
      reason
    );

    return NextResponse.json({
      ok: true,
      contact_id: contactId,
      score: result.score,
      category: result.category,
    });
  } catch (error: any) {
    console.error("Error updating lead score:", error);
    return NextResponse.json(
      { error: error.message || "Failed to update lead score" },
      { status: 500 }
    );
  }
}





















































