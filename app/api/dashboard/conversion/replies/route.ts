// app/api/dashboard/conversion/replies/route.ts
// Block 10200 — Recent Replies for Conversion Dashboard

import { NextRequest, NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase/server";
import { getActiveWorkspaceId } from "@/lib/workspace/context";

export async function GET(req: NextRequest) {
  try {
    const supabase = await getServerSupabase();
    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const workspaceId = await getActiveWorkspaceId();
    if (!workspaceId) {
      return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
    }

    // Fetch recent replies from inbound_emails or email_replies
    // Try inbound_emails first
    const { data: inboundReplies, error: inboundError } = await supabase
      .from("inbound_emails")
      .select("id, from_email, subject, body_text, classification, received_at")
      .eq("workspace_id", workspaceId)
      .order("received_at", { ascending: false })
      .limit(10);

    if (!inboundError && inboundReplies && inboundReplies.length > 0) {
      return NextResponse.json(
        inboundReplies.map((r) => ({
          id: r.id,
          from_email: r.from_email,
          subject: r.subject,
          body_text: r.body_text,
          classification: r.classification,
          received_at: r.received_at,
        }))
      );
    }

    // Fallback: try email_replies
    const { data: emailReplies, error: emailError } = await supabase
      .from("email_replies")
      .select(`
        id,
        from_email,
        subject,
        body_text,
        intent,
        received_at
      `)
      .order("received_at", { ascending: false })
      .limit(10);

    if (emailError) {
      console.error("Error fetching replies:", emailError);
      return NextResponse.json([]);
    }

    // Map intent to classification
    const classificationMap: Record<string, string> = {
      hot: "hot",
      warm: "warm",
      cold: "cold",
      not_interested: "not_interested",
      positive: "hot",
      neutral: "warm",
      negative: "not_interested",
    };

    return NextResponse.json(
      (emailReplies || []).map((r) => ({
        id: r.id,
        from_email: r.from_email,
        subject: r.subject,
        body_text: r.body_text,
        classification: classificationMap[r.intent as string] || null,
        received_at: r.received_at,
      }))
    );
  } catch (error) {
    console.error("Conversion dashboard replies API error:", error);
    return NextResponse.json(
      { error: "Failed to load replies" },
      { status: 500 }
    );
  }
}























































