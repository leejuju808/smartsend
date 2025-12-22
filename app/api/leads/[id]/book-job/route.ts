import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = createRouteHandlerClient({ cookies });
  const { id } = await params;
  const leadId = id;
  const body = await req.json();
  const { title, scheduled_date, estimated_value } = body;

  try {
    const { data: lead, error: leadError } = await supabase
      .from("leads")
      .select("id, company_id, contact_id")
      .eq("id", leadId)
      .single();

    if (leadError || !lead) {
      return NextResponse.json({ error: "Lead not found" }, { status: 404 });
    }

    // Ensure we have company_id and contact_id
    if (!lead.company_id || !lead.contact_id) {
      return NextResponse.json(
        { error: "Lead missing company_id or contact_id" },
        { status: 400 }
      );
    }

    // Create job
    const { data: job, error: jobError } = await supabase
      .from("jobs")
      .insert({
        company_id: lead.company_id,
        lead_id: lead.id,
        contact_id: lead.contact_id,
        title: title || "Roofing job",
        scheduled_date: scheduled_date ?? null,
        estimated_value: estimated_value ?? null,
      })
      .select("id")
      .single();

    if (jobError || !job) {
      throw jobError;
    }

    // Update lead
    await supabase
      .from("leads")
      .update({
        status: "booked",
        booked_job_id: job.id,
        estimated_job_value: estimated_value ?? null,
      })
      .eq("id", lead.id);

    return NextResponse.json({ success: true, job_id: job.id }, { status: 200 });
  } catch (err: any) {
    console.error(err);
    return NextResponse.json(
      { error: "Failed to book job" },
      { status: 500 }
    );
  }
}











































