import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";

export async function POST(req: Request) {
  try {
    const cookieStore = cookies();
    const supabase = createRouteHandlerClient({ cookies: () => cookieStore });
    
    // Verify authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { email, name, sequence_id } = await req.json();
    if (!email || !sequence_id) {
      return NextResponse.json({ error: "Missing email or sequence_id" }, { status: 400 });
    }

    // Verify the sequence exists and user has access
    const { data: sequence, error: sequenceError } = await supabase
      .from("sequences")
      .select("id, workspace_id")
      .eq("id", sequence_id)
      .single();

    if (sequenceError || !sequence) {
      return NextResponse.json({ error: "Sequence not found" }, { status: 404 });
    }

    // Check if user has access to the workspace
    const { data: membership, error: membershipError } = await supabase
      .from("workspace_members")
      .select("role")
      .eq("workspace_id", sequence.workspace_id)
      .eq("user_id", user.id)
      .single();

    if (membershipError || !membership) {
      return NextResponse.json({ error: "Access denied to sequence" }, { status: 403 });
    }

    // Create or get the lead
    const { data: lead, error: leadError } = await supabase
      .from("leads")
      .upsert({ email, name }, { onConflict: "email" })
      .select()
      .single();

    if (leadError) {
      console.error("Error creating lead:", leadError);
      return NextResponse.json({ error: "Failed to create lead" }, { status: 500 });
    }

    // Create the enrollment
    const { data: enrollment, error: enrollmentError } = await supabase
      .from("sequence_enrollments")
      .insert({ 
        lead_id: lead.id, 
        sequence_id,
        current_step: 0,
        status: "active"
      })
      .select()
      .single();

    if (enrollmentError) {
      console.error("Error creating enrollment:", enrollmentError);
      return NextResponse.json({ error: "Failed to create enrollment" }, { status: 500 });
    }

    // Get sequence steps
    const { data: steps, error: stepsError } = await supabase
      .from("sequence_steps")
      .select("*")
      .eq("sequence_id", sequence_id)
      .order("step_no");

    if (stepsError) {
      console.error("Error fetching steps:", stepsError);
      return NextResponse.json({ error: "Failed to fetch sequence steps" }, { status: 500 });
    }

    if (!steps || steps.length === 0) {
      return NextResponse.json({ error: "No steps found in sequence" }, { status: 400 });
    }

    // Queue emails for each step
    const now = new Date();
    const emailInserts = steps.map((step: any) => ({
      user_id: user.id,
      to_email: email,
      subject: step.subject_template || "Follow up",
      body: step.text_template || step.html_template || "Follow up email",
      status: "queued",
      scheduled_at: new Date(now.getTime() + (step.wait_seconds || 0) * 1000).toISOString(),
    }));

    const { error: emailError } = await supabase
      .from("email_sends")
      .insert(emailInserts);

    if (emailError) {
      console.error("Error queuing emails:", emailError);
      return NextResponse.json({ error: "Failed to queue emails" }, { status: 500 });
    }

    return NextResponse.json({ 
      ok: true, 
      lead, 
      enrollment, 
      queued: emailInserts.length 
    });

  } catch (error) {
    console.error("Error enrolling lead:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}