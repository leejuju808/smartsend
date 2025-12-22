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

  try {
    const { data: lead, error: leadError } = await supabase
      .from("leads")
      .select("id, company_id, contact_id")
      .eq("id", leadId)
      .single();

    if (leadError || !lead) {
      return NextResponse.json({ error: "Lead not found" }, { status: 404 });
    }

    // Update lead status + intent
    await supabase
      .from("leads")
      .update({
        status: "cold",
        intent: "not_interested",
      })
      .eq("id", leadId);

    // Stop follow-ups on profile
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
          .update({
            status: "cold",
            next_run_at: null,
          })
          .eq("id", profile.id);

        await supabase.from("follow_up_logs").insert({
          follow_up_profile_id: profile.id,
          company_id: lead.company_id,
          campaign_id: null,
          contact_id: lead.contact_id,
          action: "marked_cold_manual",
          notes: "Manually marked as cold from inbox.",
        });
      }
    }

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (err: any) {
    console.error(err);
    return NextResponse.json(
      { error: "Failed to mark lead as cold" },
      { status: 500 }
    );
  }
}











































