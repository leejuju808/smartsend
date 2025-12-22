import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";

export async function POST(req: Request) {
  try {
    const cookieStore = await cookies();
    const supabase = createRouteHandlerClient({ cookies: () => cookieStore });
    
    // Verify authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { quote_id, decision } = await req.json();
    // decision: "accepted" | "rejected"

    if (!quote_id || !["accepted", "rejected"].includes(decision)) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }

    // Verify quote exists and user has access
    const { data: quote, error: quoteErr } = await supabase
      .from("quotes")
      .select("id, lead_id, total, leads!inner(workspace_id, campaign_id, sequence_id)")
      .eq("id", quote_id)
      .single();

    if (quoteErr || !quote) {
      return NextResponse.json({ error: "Quote not found" }, { status: 404 });
    }

    // Verify workspace access
    const { data: membership } = await supabase
      .from("workspace_members")
      .select("workspace_id")
      .eq("workspace_id", quote.leads.workspace_id)
      .eq("user_id", user.id)
      .single();

    if (!membership) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    const leadId = quote.lead_id;
    const lead = quote.leads as any;

    // Update quote status and attribution (Block 21743: Revenue Attribution)
    const updateData: any = {
      status: decision,
      decided_at: new Date().toISOString()
    };

    // When quote is accepted, set campaign attribution from the lead
    if (decision === "accepted") {
      updateData.campaign_id = lead.campaign_id || null;
      updateData.sequence_id = lead.sequence_id || null;
      updateData.attributed_lead_id = leadId;
    }

    const { error: updErr } = await supabase
      .from("quotes")
      .update(updateData)
      .eq("id", quote_id);

    if (updErr) {
      console.error("Error updating quote decision:", updErr);
      return NextResponse.json({ error: updErr.message }, { status: 500 });
    }

    // Move pipeline stage + log
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
    const addEventUrl = process.env.ADD_LEAD_EVENT_URL || 
      (supabaseUrl ? `${supabaseUrl}/functions/v1/add-lead-event` : null);

    if (decision === "accepted") {
      const { error: leadUpdErr } = await supabase
        .from("leads")
        .update({
          pipeline_stage: "won",
          job_value: quote.total  // Block 21742: Set job_value from accepted quote
        })
        .eq("id", leadId);

      if (leadUpdErr) {
        console.error("Error updating lead pipeline:", leadUpdErr);
        // Don't fail the whole request
      }

      if (addEventUrl) {
        try {
          await fetch(addEventUrl, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY}`,
            },
            body: JSON.stringify({
              lead_id: leadId,
              event_type: "quote_signed",
              event_subtype: "accepted",
              message: `Estimate accepted ($${Number(
                quote.total
              ).toLocaleString()})`,
              metadata: { quote_id }
            })
          });
        } catch (eventErr) {
          console.error("Failed to log timeline event:", eventErr);
        }
      }
    } else {
      const { error: leadUpdErr } = await supabase
        .from("leads")
        .update({
          pipeline_stage: "lost"
        })
        .eq("id", leadId);

      if (leadUpdErr) {
        console.error("Error updating lead pipeline:", leadUpdErr);
        // Don't fail the whole request
      }

      if (addEventUrl) {
        try {
          await fetch(addEventUrl, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY}`,
            },
            body: JSON.stringify({
              lead_id: leadId,
              event_type: "quote_signed",
              event_subtype: "rejected",
              message: "Estimate rejected",
              metadata: { quote_id }
            })
          });
        } catch (eventErr) {
          console.error("Failed to log timeline event:", eventErr);
        }
      }
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Unexpected error in quote decision:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

