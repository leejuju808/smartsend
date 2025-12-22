import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { lead_id, persona_id } = body;

    if (!lead_id) {
      return NextResponse.json(
        { error: "lead_id is required" },
        { status: 400 },
      );
    }

    const supabase = createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get lead to verify ownership and get org_id
    const { data: lead, error: leadError } = await supabase
      .from("leads")
      .select("id, org_id")
      .eq("id", lead_id)
      .maybeSingle();

    if (leadError || !lead) {
      return NextResponse.json(
        { error: "Lead not found" },
        { status: 404 },
      );
    }

    // Verify user is a member of the org
    if (lead.org_id) {
      const { data: membership, error: membershipError } = await supabase
        .from("org_members")
        .select("role")
        .eq("org_id", lead.org_id)
        .eq("user_id", user.id)
        .maybeSingle();

      if (membershipError || !membership) {
        return NextResponse.json(
          { error: "Not a member of this organization" },
          { status: 403 },
        );
      }
    }

    // If persona_id is provided, verify it belongs to the same org
    if (persona_id && lead.org_id) {
      const { data: persona, error: personaError } = await supabase
        .from("sdr_personas")
        .select("org_id")
        .eq("id", persona_id)
        .eq("org_id", lead.org_id)
        .maybeSingle();

      if (personaError || !persona) {
        return NextResponse.json(
          { error: "Persona not found or does not belong to this org" },
          { status: 404 },
        );
      }
    }

    // Update lead's ai_persona_id
    const { data: updatedLead, error: updateError } = await supabase
      .from("leads")
      .update({ ai_persona_id: persona_id || null })
      .eq("id", lead_id)
      .select("*")
      .single();

    if (updateError) {
      return NextResponse.json(
        { error: "update_failed", details: updateError },
        { status: 500 },
      );
    }

    return NextResponse.json({ lead: updatedLead });
  } catch (err: any) {
    console.error(err);
    return NextResponse.json(
      { error: "unexpected", details: String(err) },
      { status: 500 },
    );
  }
}

