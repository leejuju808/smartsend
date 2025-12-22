// Block 16300 — SmartSend Pipeline Board v2 API
// GET /api/pipeline/board
// Returns leads grouped by Pipeline v2 stages (9 roofing-specific columns)

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { getCurrentWorkspaceId } from "@/lib/workspace";

export async function GET(req: NextRequest) {
  try {
    const supabase = createClient();
    const workspaceId = await getCurrentWorkspaceId();

    if (!workspaceId) {
      return NextResponse.json(
        { error: "Workspace not found" },
        { status: 404 }
      );
    }

    // Get user for auth check
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get pipeline stages for this workspace
    const { data: stages } = await supabase
      .from("pipeline_stages")
      .select("id, key, label, position")
      .eq("workspace_id", workspaceId)
      .order("position", { ascending: true });

    // Get contacts with pipeline v2 data
    const { data: contacts, error: contactsError } = await supabase
      .from("contacts")
      .select(`
        id,
        email,
        first_name,
        last_name,
        phone,
        company,
        city,
        state,
        postal_code,
        zip,
        tags,
        pipeline_stage_key,
        pipeline_stage_id,
        moved_to_stage_at,
        last_auto_moved_at,
        auto_move_reason,
        last_appointment_at,
        next_appointment_at,
        inspection_completed_at,
        inspection_notes,
        quote_amount,
        quote_sent_at,
        follow_up_reminder_date,
        pipeline_warning,
        pipeline_warning_at,
        storm_risk_score,
        storm_risk_level,
        estimated_value_min,
        estimated_value_max,
        est_job_value,
        created_at,
        updated_at
      `)
      .eq("workspace_id", workspaceId)
      .order("updated_at", { ascending: false });

    if (contactsError) {
      console.error("[Pipeline Board v2] Contacts error:", contactsError);
      return NextResponse.json(
        { error: "Failed to fetch contacts" },
        { status: 500 }
      );
    }

    const contactIds = (contacts || []).map((c) => c.id);

    // Get lead heat scores
    const { data: heatScores } = await supabase
      .from("lead_heat_scores")
      .select("contact_id, heat_score, heat_level")
      .in("contact_id", contactIds);

    const heatScoresByContactId = new Map<string, any>();
    (heatScores || []).forEach((hs) => {
      heatScoresByContactId.set(hs.contact_id, hs);
    });

    // Get insurance metadata
    const { data: insuranceMetadata } = await supabase
      .from("insurance_metadata")
      .select("contact_id, has_insurance_claim, claim_number, storm_related")
      .in("contact_id", contactIds);

    const insuranceByContactId = new Map<string, any>();
    (insuranceMetadata || []).forEach((im) => {
      insuranceByContactId.set(im.contact_id, im);
    });

    // Get latest messages for each contact
    const { data: messages } = await supabase
      .from("inbox_messages")
      .select("id, contact_id, from_email, subject, body_text, received_at, created_at")
      .in("contact_id", contactIds)
      .eq("direction", "in")
      .order("received_at", { ascending: false });

    // Group messages by contact_id
    const messagesByContactId = new Map<string, any>();
    (messages || []).forEach((msg) => {
      if (msg.contact_id && !messagesByContactId.has(msg.contact_id)) {
        messagesByContactId.set(msg.contact_id, msg);
      }
    });

    // Enrich contacts with heat scores, insurance, messages
    const enrichedContacts = (contacts || []).map((contact) => {
      const heatScore = heatScoresByContactId.get(contact.id);
      const insurance = insuranceByContactId.get(contact.id);
      const latestMessage = messagesByContactId.get(contact.id);
      
      // Default to 'new_leads' if no stage set
      const stageKey = contact.pipeline_stage_key || 'new_leads';

      return {
        ...contact,
        heat_score: heatScore?.heat_score || 0,
        heat_level: heatScore?.heat_level || 'cold',
        has_insurance: insurance?.has_insurance_claim || false,
        insurance_claim_number: insurance?.claim_number || null,
        storm_related_insurance: insurance?.storm_related || false,
        last_message: latestMessage
          ? {
              subject: latestMessage.subject,
              snippet: latestMessage.body_text?.substring(0, 100) || "No message preview",
              received_at: latestMessage.received_at || latestMessage.created_at,
            }
          : null,
        estimated_value: contact.est_job_value || contact.estimated_value_min || null,
      };
    });

    // Group by pipeline stage key
    const grouped: Record<string, typeof enrichedContacts> = {};
    
    // Initialize groups with stage keys
    (stages || []).forEach((stage) => {
      grouped[stage.key] = [];
    });

    // Fallback groups if no stages exist
    if (!stages || stages.length === 0) {
      grouped['new_leads'] = [];
      grouped['warm_leads'] = [];
      grouped['hot_leads'] = [];
      grouped['appointment_booked'] = [];
      grouped['inspection_completed'] = [];
      grouped['insurance_opportunity'] = [];
      grouped['quote_sent'] = [];
      grouped['requote_revival'] = [];
      grouped['not_interested'] = [];
    }

    enrichedContacts.forEach((contact) => {
      const stageKey = contact.pipeline_stage_key || 'new_leads';
      if (grouped[stageKey]) {
        grouped[stageKey].push(contact);
      } else {
        grouped['new_leads'].push(contact);
      }
    });

    // Sort each group by heat_score descending, then by updated_at
    Object.keys(grouped).forEach((stage) => {
      grouped[stage].sort((a, b) => {
        const scoreDiff = (b.heat_score || 0) - (a.heat_score || 0);
        if (scoreDiff !== 0) return scoreDiff;
        return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
      });
    });

    return NextResponse.json({
      pipeline: grouped,
      stages: stages || [],
      total_leads: enrichedContacts.length,
    });
  } catch (error: any) {
    console.error("[Pipeline Board v2] Unexpected error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

