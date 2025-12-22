// Block 150000 — Unified Messaging Inbox Thread API
// GET /api/inbox/unified/[leadId]
// Returns all messages for a specific lead (thread view)

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ leadId: string }> }
) {
  try {
    const { leadId } = await params;
    const searchParams = req.nextUrl.searchParams;
    const companyId = searchParams.get("company_id");

    if (!companyId) {
      return NextResponse.json(
        { error: "company_id is required" },
        { status: 400 }
      );
    }

    // Get all messages for this lead
    const { data: messages, error: messagesError } = await supabase
      .from("messages")
      .select("*")
      .eq("company_id", companyId)
      .eq("lead_id", leadId)
      .order("created_at", { ascending: true });

    if (messagesError) {
      console.error("Error fetching messages:", messagesError);
      return NextResponse.json(
        { error: "Failed to fetch messages" },
        { status: 500 }
      );
    }

    // Get lead information
    const { data: lead, error: leadError } = await supabase
      .from("leads")
      .select("id, name, email, phone, address, heat_score, status")
      .eq("id", leadId)
      .eq("roofing_company_id", companyId)
      .single();

    if (leadError) {
      console.error("Error fetching lead:", leadError);
    }

    return NextResponse.json({
      lead: lead || null,
      messages: messages || [],
    });
  } catch (error: any) {
    console.error("Error in unified inbox thread API:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// POST /api/inbox/unified/[leadId] - Mark messages as read
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ leadId: string }> }
) {
  try {
    const { leadId } = await params;
    const body = await req.json();
    const { user_id, company_id } = body;

    if (!user_id || !company_id) {
      return NextResponse.json(
        { error: "user_id and company_id are required" },
        { status: 400 }
      );
    }

    // Mark messages as read using the helper function
    const { error } = await supabase.rpc("mark_messages_read", {
      p_lead_id: leadId,
      p_user_id: user_id,
    });

    if (error) {
      console.error("Error marking messages as read:", error);
      return NextResponse.json(
        { error: "Failed to mark messages as read" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Error in mark read API:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}


























