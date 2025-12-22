import { NextRequest, NextResponse } from "next/server";
import { requireWorkspace } from "@/lib/workspace/withWorkspace";
import { supabaseAdmin } from "@/lib/supabase/admin";

// GET /api/inbox/unified - Fetch unified inbox messages with intent filtering
export async function GET(req: NextRequest) {
  const gate = await requireWorkspace(req);
  if ("error" in gate) return gate.error;

  const { workspace_id } = gate;
  const { searchParams } = new URL(req.url);
  
  const filter = searchParams.get("filter") || "all"; // all, hot, warm, price_question, follow_up_required, not_interested, referral
  const limit = parseInt(searchParams.get("limit") || "50");
  const offset = parseInt(searchParams.get("offset") || "0");
  const search = searchParams.get("search") || "";

  try {
    let query = supabaseAdmin
      .from("inbox_messages")
      .select(
        `
        id,
        subject,
        body,
        sender,
        sender_email,
        direction,
        intent,
        replied,
        requires_followup,
        thread_id,
        provider,
        created_at,
        read_at,
        classified_at,
        lead_id,
        campaign_id,
        leads:lead_id (
          id,
          first_name,
          last_name,
          email,
          status
        ),
        campaigns:campaign_id (
          id,
          name
        )
        `
      )
      .eq("workspace_id", workspace_id)
      .eq("direction", "inbound")
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    // Apply intent filter
    if (filter !== "all") {
      query = query.eq("intent", filter);
    }

    // Apply search
    if (search) {
      query = query.or(
        `subject.ilike.%${search}%,body.ilike.%${search}%,sender.ilike.%${search}%,sender_email.ilike.%${search}%`
      );
    }

    const { data: messages, error } = await query;

    if (error) {
      console.error("Error fetching inbox messages:", error);
      return NextResponse.json(
        { error: "Failed to fetch messages" },
        { status: 500 }
      );
    }

    // Format response
    const formatted = (messages || []).map((msg: any) => ({
      id: msg.id,
      subject: msg.subject || "(No subject)",
      body: msg.body || "",
      bodySnippet: (msg.body || "").substring(0, 200),
      sender: msg.sender || msg.sender_email,
      senderEmail: msg.sender_email,
      direction: msg.direction,
      intent: msg.intent || "unknown",
      replied: msg.replied || false,
      requiresFollowup: msg.requires_followup || false,
      threadId: msg.thread_id,
      provider: msg.provider,
      createdAt: msg.created_at,
      readAt: msg.read_at,
      classifiedAt: msg.classified_at,
      lead: msg.leads
        ? {
            id: msg.leads.id,
            name: `${msg.leads.first_name || ""} ${msg.leads.last_name || ""}`.trim() || msg.leads.email,
            email: msg.leads.email,
            status: msg.leads.status,
          }
        : null,
      campaign: msg.campaigns
        ? {
            id: msg.campaigns.id,
            name: msg.campaigns.name,
          }
        : null,
    }));

    // Get counts for filters
    const { data: counts } = await supabaseAdmin
      .from("inbox_messages")
      .select("intent")
      .eq("workspace_id", workspace_id)
      .eq("direction", "inbound");

    const intentCounts = {
      all: (counts || []).length,
      hot_lead: (counts || []).filter((c: any) => c.intent === "hot_lead").length,
      warm_lead: (counts || []).filter((c: any) => c.intent === "warm_lead").length,
      price_question: (counts || []).filter((c: any) => c.intent === "price_question").length,
      follow_up_required: (counts || []).filter((c: any) => c.intent === "follow_up_required").length,
      not_interested: (counts || []).filter((c: any) => c.intent === "not_interested").length,
      referral: (counts || []).filter((c: any) => c.intent === "referral").length,
    };

    return NextResponse.json({
      messages: formatted,
      counts: intentCounts,
      hasMore: formatted.length === limit,
    });
  } catch (error) {
    console.error("Error in unified inbox API:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// POST /api/inbox/unified - Create or classify a message
export async function POST(req: NextRequest) {
  const gate = await requireWorkspace(req);
  if ("error" in gate) return gate.error;

  const { workspace_id } = gate;
  const body = await req.json();

  const {
    lead_id,
    campaign_id,
    subject,
    body: messageBody,
    body_html,
    sender,
    sender_email,
    recipient,
    recipient_email,
    direction = "inbound",
    thread_id,
    provider_message_id,
    provider,
    metadata,
    classify = true, // Whether to trigger AI classification
  } = body;

  try {
    // Insert message
    const { data: message, error: insertError } = await supabaseAdmin
      .from("inbox_messages")
      .insert({
        workspace_id,
        lead_id,
        campaign_id,
        subject,
        body: messageBody,
        body_html,
        sender,
        sender_email,
        recipient,
        recipient_email,
        direction,
        thread_id,
        provider_message_id,
        provider,
        metadata: metadata || {},
      })
      .select()
      .single();

    if (insertError) {
      console.error("Error inserting message:", insertError);
      return NextResponse.json(
        { error: "Failed to create message" },
        { status: 500 }
      );
    }

    // Trigger AI classification if requested and message is inbound
    if (classify && direction === "inbound" && messageBody) {
      try {
        const classifyUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/unified-classify-intent`;
        await fetch(classifyUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
          },
          body: JSON.stringify({
            message_id: message.id,
            body: messageBody,
          }),
        }).catch((err) => {
          console.error("Error triggering classification:", err);
          // Don't fail the request if classification fails
        });
      } catch (classifyErr) {
        console.error("Classification error:", classifyErr);
      }
    }

    return NextResponse.json({ message }, { status: 201 });
  } catch (error) {
    console.error("Error in POST unified inbox:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}


































