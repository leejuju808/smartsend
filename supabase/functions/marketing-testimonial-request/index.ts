// Block 254900 — SmartSend Marketing Engine v1
// Testimonial Request Automation
// Automatically requests video/audio testimonials from satisfied customers

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
        customer_id
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

    // Check if testimonial already requested
    const { data: existingTestimonial } = await supabase
      .from("customer_testimonials")
      .select("id")
      .eq("job_id", job_id)
      .single();

    if (existingTestimonial) {
      return new Response(
        JSON.stringify({
          message: "Testimonial already requested for this job",
          testimonial_id: existingTestimonial.id,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 2. Check if customer gave a 5-star review (only request from happy customers)
    const { data: reviews } = await supabase
      .from("reviews")
      .select("rating")
      .eq("job_id", job_id)
      .eq("rating", 5)
      .limit(1);

    if (!reviews || reviews.length === 0) {
      return new Response(
        JSON.stringify({
          message: "No 5-star review found. Testimonials only requested from 5-star customers.",
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 3. Get company details
    const { data: company } = await supabase
      .from("roofing_companies")
      .select("name, website")
      .eq("id", job.roofing_company_id)
      .single();

    // 4. Create testimonial request record
    const { data: testimonial, error: createError } = await supabase
      .from("customer_testimonials")
      .insert({
        job_id: job_id,
        customer_id: job.customer_id,
        workspace_id: job.workspace_id,
        roofing_company_id: job.roofing_company_id,
        customer_name: job.homeowner_name,
        media_type: "video", // Default to video, can be changed by customer
        status: "pending",
        requested_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (createError) {
      throw createError;
    }

    // 5. Get email template
    const { data: template } = await supabase
      .from("email_templates")
      .select("base_subject, base_body")
      .eq("template_key", "homeowner_testimonial_request")
      .single();

    // 6. Build testimonial upload link
    // TODO: Generate secure upload link for customer
    const uploadLink = `${process.env.NEXT_PUBLIC_APP_URL || "https://app.smartsend.ai"}/testimonials/upload?token=${testimonial.id}`;

    // 7. Prepare email content
    const subject =
      template?.base_subject ||
      "We'd love to feature your testimonial!";
    let body =
      template?.base_body ||
      `Hi ${job.homeowner_name || "there"},

We're so grateful for your 5-star review! Would you be willing to share a short video or audio testimonial about your experience?

Your testimonial will help other homeowners choose trusted roofing companies.

Upload your testimonial here:
${uploadLink}

You can record a quick video on your phone (30-60 seconds) or send us an audio message. We'll add our branding and share it on our website and social media.

Thank you for being an amazing customer!

${company?.name || "Our Team"}`;

    // Replace template variables
    body = body
      .replace(/\{\{first_name\}\}/g, job.homeowner_name?.split(" ")[0] || "there")
      .replace(/\{\{upload_link\}\}/g, uploadLink)
      .replace(/\{\{company_name\}\}/g, company?.name || "Our Team");

    // 8. Send email (or SMS if phone provided)
    if (job.homeowner_email) {
      // TODO: Integrate with email sending system
      console.log(`Would send testimonial request email to ${job.homeowner_email}:`, {
        subject,
        body,
      });
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: "Testimonial request sent",
        testimonial,
        upload_link: uploadLink,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Error requesting testimonial:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});






















