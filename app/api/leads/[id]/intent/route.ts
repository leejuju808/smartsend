import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = createRouteHandlerClient({ cookies });
  const { id } = await params;
  const leadId = id;
  const body = await req.json();
  const intent = body.intent as "hot" | "warm" | "not_interested" | "other" | "unknown";

  try {
    const { data: lead, error: leadError } = await supabase
      .from("leads")
      .select("id, company_id, contact_id")
      .eq("id", leadId)
      .single();

    if (leadError || !lead) {
      return NextResponse.json({ error: "Lead not found" }, { status: 404 });
    }

    // Update lead
    const { error: updateLeadError } = await supabase
      .from("leads")
      .update({ intent })
      .eq("id", leadId);

    if (updateLeadError) throw updateLeadError;

    // Also update follow_up_profile (most recent for this contact)
    if (lead.contact_id) {
      const { data: profile } = await supabase
        .from("follow_up_profiles")
        .select("id")
        .eq("company_id", lead.company_id)
        .eq("contact_id", lead.contact_id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (profile) {
        await supabase
          .from("follow_up_profiles")
          .update({ lead_intent: intent })
          .eq("id", profile.id);
      }
    }

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (err: any) {
    console.error(err);
    return NextResponse.json(
      { error: "Failed to update lead intent" },
      { status: 500 }
    );
  }
}











































