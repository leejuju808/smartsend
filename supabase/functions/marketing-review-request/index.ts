// Block 254900 — SmartSend Marketing Engine v1
// Review Request Automation
// Automatically sends review requests after job completion

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.48.0";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
  auth: { persistSession: false },
});

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { job_id } = await req.json();

    if (!job_id) {
      return new Response(
        JSON.stringify({ error: "job_id is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 1. Get job details
    const { data: job, error: jobError } = await supabase
      .from("roofing_jobs")
      .select(`
        id,
        workspace_id,
        roofing_company_id,
        homeowner_name,
        homeowner_email,
        homeowner_phone,
        status,
        completed_at,
        city,
        state
      `)
      .eq("id", job_id)
      .single();

    if (jobError || !job) {
      return new Response(
        JSON.stringify({ error: "Job not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Only process if job is completed
    if (job.status !== "completed") {
      return new Response(
        JSON.stringify({ error: "Job is not completed yet" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 2. Get or create review request automation record
    let { data: automation, error: automationError } = await supabase
      .from("review_request_automation")
      .select("*")
      .eq("job_id", job_id)
      .single();

    if (automationError && automationError.code === "PGRST116") {
      // Doesn't exist, create it
      const { data: newAutomation, error: createError } = await supabase
        .from("review_request_automation")
        .insert({
          job_id: job_id,
          workspace_id: job.workspace_id,
          roofing_company_id: job.roofing_company_id,
          status: "pending",
        })
        .select()
        .single();

      if (createError) {
        throw createError;
      }
      automation = newAutomation;
    } else if (automationError) {
      throw automationError;
    }

    // 3. Get company details for review links
    const { data: company } = await supabase
      .from("roofing_companies")
      .select("name, website, google_business_profile_url")
      .eq("id", job.roofing_company_id)
      .single();

    // 4. Determine which request to send
    const now = new Date();
    const completionDate = job.completed_at ? new Date(job.completed_at) : new Date();
    const daysSinceCompletion = Math.floor(
      (now.getTime() - completionDate.getTime()) / (1000 * 60 * 60 * 24)
    );

    let requestType: "initial" | "reminder_1" | "reminder_2" | null = null;
    let shouldSend = false;

    if (!automation.initial_request_sent_at) {
      requestType = "initial";
      shouldSend = true;
    } else if (!automation.reminder_1_sent_at && daysSinceCompletion >= 3) {
      requestType = "reminder_1";
      shouldSend = true;
    } else if (!automation.reminder_2_sent_at && daysSinceCompletion >= 7) {
      requestType = "reminder_2";
      shouldSend = true;
    }

    if (!shouldSend) {
      return new Response(
        JSON.stringify({
          message: "No review request needed at this time",
          automation,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 5. Get email template
    const templateKey =
      requestType === "initial"
        ? "homeowner_review_request"
        : requestType === "reminder_1"
        ? "homeowner_review_reminder"
        : "homeowner_review_final";

    const { data: template } = await supabase
      .from("email_templates")
      .select("base_subject, base_body")
      .eq("template_key", templateKey)
      .single();

    // 6. Build review links
    const googleReviewLink = company?.google_business_profile_url
      ? `${company.google_business_profile_url}/review`
      : `https://search.google.com/local/writereview?placeid=${job.roofing_company_id}`;

    // 7. Prepare email content
    const subject = template?.base_subject || "We'd love to hear how we did!";
    let body = template?.base_body || `Hi ${job.homeowner_name || "there"},

We'd love to hear about your experience with us! Your feedback helps other homeowners choose trusted roofing companies.

Leave a review:
${googleReviewLink}

Thanks for choosing us!
`;

    // Replace template variables
    body = body
      .replace(/\{\{first_name\}\}/g, job.homeowner_name?.split(" ")[0] || "there")
      .replace(/\{\{google_review_link\}\}/g, googleReviewLink);

    // 8. Send email (or SMS if phone provided)
    if (job.homeowner_email) {
      // TODO: Integrate with email sending system
      // For now, we'll just log it and update the automation record
      console.log(`Would send email to ${job.homeowner_email}:`, { subject, body });
    }

    // 9. Update automation record
    const updateData: any = {
      status:
        requestType === "initial"
          ? "request_sent"
          : requestType === "reminder_1"
          ? "reminder_1_sent"
          : "reminder_2_sent",
    };

    if (requestType === "initial") {
      updateData.initial_request_sent_at = new Date().toISOString();
    } else if (requestType === "reminder_1") {
      updateData.reminder_1_sent_at = new Date().toISOString();
    } else if (requestType === "reminder_2") {
      updateData.reminder_2_sent_at = new Date().toISOString();
    }

    const { data: updatedAutomation, error: updateError } = await supabase
      .from("review_request_automation")
      .update(updateData)
      .eq("id", automation.id)
      .select()
      .single();

    if (updateError) {
      throw updateError;
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: `Review request sent (${requestType})`,
        automation: updatedAutomation,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Error in review request automation:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});






















