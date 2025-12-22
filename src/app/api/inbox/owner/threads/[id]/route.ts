import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * GET /api/inbox/owner/threads/[id]
 * Fetch full thread details including all messages and contact info
 */
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createClient();
    
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const threadId = params.id;

    // Fetch thread
    const { data: thread, error: threadError } = await supabase
      .from("inbox_threads")
      .select(`
        id,
        contact_id,
        campaign_id,
        last_message_at,
        ai_overall_intent,
        highest_lead_score,
        summary_v2,
        urgency_level,
        call_notes_address,
        call_notes_issue_type,
        call_notes_urgency,
        call_notes_generated_at,
        status,
        lead_stage,
        next_action_at,
        last_contact_method,
        last_contact_at,
        assigned_to_user_id,
        estimated_job_value,
        actual_job_value,
        currency,
        close_date,
        source_campaign_id,
        is_insurance_claim,
        insurance_carrier,
        engagement_score,
        engagement_level,
        created_at,
        updated_at,
        campaigns:campaign_id (
          workspace_id
        ),
        source_campaign:source_campaign_id (
          id,
          name,
          title
        )
      `)
      .eq("id", threadId)
      .single();

    if (threadError || !thread) {
      return NextResponse.json(
        { error: "Thread not found" },
        { status: 404 }
      );
    }

    // Fetch contact separately
    let contact = null;
    if (thread.contact_id) {
      const { data: contactData } = await supabase
        .from("contacts")
        .select("id, email, first_name, last_name, city, state, phone")
        .eq("id", thread.contact_id)
        .single();
      contact = contactData;
    }

    // Fetch all messages for this thread
    const { data: messages, error: messagesError } = await supabase
      .from("inbox_messages")
      .select("*")
      .eq("thread_id", threadId)
      .order("received_at", { ascending: true });

    if (messagesError) {
      console.error("Error fetching messages:", messagesError);
      return NextResponse.json(
        { error: messagesError.message },
        { status: 500 }
      );
    }

    // Fetch AI summary if available (from a future table or computed field)
    // For now, we'll return a placeholder structure

    const contactName = contact
      ? `${contact.first_name || ""} ${contact.last_name || ""}`.trim() || contact.email
      : "Unknown";

    const campaign = thread.campaigns as any;
    const workspaceId = campaign?.workspace_id || null;
    
    // Get source campaign name
    const sourceCampaign = thread.source_campaign as any;
    const sourceCampaignName = sourceCampaign 
      ? (sourceCampaign.name || sourceCampaign.title || null)
      : null;

    const aiSummary =
      (thread as any)?.summary_v2 ||
      null;

    return NextResponse.json({
      thread: {
        id: thread.id,
        contactId: thread.contact_id,
        campaignId: thread.campaign_id,
        workspaceId,
        contactName,
        contactEmail: contact?.email || "",
        contactCity: contact?.city || "",
        contactState: contact?.state || "",
        contactPhone: contact?.phone || "",
        intent: thread.ai_overall_intent,
        leadScore: thread.highest_lead_score,
        status: thread.status,
        leadStage: thread.lead_stage || "new",
        nextActionAt: thread.next_action_at,
        lastContactMethod: thread.last_contact_method,
        lastContactAt: thread.last_contact_at,
        assignedToUserId: thread.assigned_to_user_id,
        estimatedJobValue: thread.estimated_job_value,
        actualJobValue: thread.actual_job_value,
        currency: thread.currency,
        closeDate: thread.close_date,
        sourceCampaignId: thread.source_campaign_id,
        sourceCampaignName,
        isInsuranceClaim: thread.is_insurance_claim,
        insuranceCarrier: thread.insurance_carrier,
        engagementScore: thread.engagement_score,
        engagementLevel: thread.engagement_level,
        callNotes: {
          address: (thread as any).call_notes_address || null,
          issueType: (thread as any).call_notes_issue_type || null,
          urgency: (thread as any).call_notes_urgency || (thread as any).urgency_level || null,
          generatedAt: (thread as any).call_notes_generated_at || null,
        },
        lastMessageAt: thread.last_message_at,
        createdAt: thread.created_at,
        updatedAt: thread.updated_at,
      },
      messages: messages || [],
      aiSummary, // populated by AI worker (summary_v2)
    });
  } catch (error: any) {
    console.error("Error in /api/inbox/owner/threads/[id]:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

