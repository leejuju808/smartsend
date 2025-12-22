// Block 28060 — SmartSend Roofing Review & Referral Engine v1
// Edge Function: Send Review Request
// Sends SMS + Email asking homeowner for a Google review

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const vonageSmsUrl = Deno.env.get("VONAGE_SMS_URL") || "";
const googleReviewUrl = Deno.env.get("GOOGLE_REVIEW_URL") || "";

Deno.serve(async (req: Request) => {
  try {
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    
    const { homeowner_id, lead_id, phone, email, name, google_link } = await req.json();

    if (!homeowner_id || !lead_id) {
      return new Response(
        JSON.stringify({ error: "homeowner_id and lead_id are required" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Get homeowner profile
    const { data: homeowner, error: homeownerError } = await supabase
      .from("homeowner_profiles")
      .select("*")
      .eq("id", homeowner_id)
      .single();

    if (homeownerError || !homeowner) {
      return new Response(
        JSON.stringify({ error: "Homeowner profile not found" }),
        { status: 404, headers: { "Content-Type": "application/json" } }
      );
    }

    // Get lead info
    const { data: lead, error: leadError } = await supabase
      .from("leads")
      .select("email, phone, first_name, last_name")
      .eq("id", lead_id)
      .single();

    if (leadError || !lead) {
      return new Response(
        JSON.stringify({ error: "Lead not found" }),
        { status: 404, headers: { "Content-Type": "application/json" } }
      );
    }

    const homeownerName = name || `${lead.first_name || ""} ${lead.last_name || ""}`.trim() || "there";
    const homeownerEmail = email || lead.email;
    const homeownerPhone = phone || lead.phone;
    const reviewLink = google_link || googleReviewUrl || "";

    // Create review request record
    const { data: reviewRequest, error: reviewError } = await supabase
      .from("review_requests")
      .insert({
        homeowner_id,
        lead_id,
        workspace_id: homeowner.workspace_id,
        review_link_url: reviewLink,
        google_review_link: reviewLink,
        status: "sent",
      })
      .select()
      .single();

    if (reviewError) {
      console.error("Error creating review request:", reviewError);
      return new Response(
        JSON.stringify({ error: reviewError.message }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    // Increment review requested count
    await supabase.rpc("increment_review_requested", { homeowner_id });

    // Send SMS if phone provided
    if (homeownerPhone && vonageSmsUrl) {
      try {
        const smsText = `Hi ${homeownerName}, thanks for choosing us for your roofing project! Could you take 20 seconds to leave a Google review? ${reviewLink}`;
        
        await fetch(vonageSmsUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            to: homeownerPhone,
            text: smsText,
          }),
        });
      } catch (smsError) {
        console.error("Error sending SMS:", smsError);
        // Continue even if SMS fails
      }
    }

    // Send Email
    if (homeownerEmail) {
      try {
        // Use Supabase Edge Function to send email via existing email system
        const emailSubject = "Quick Review Request";
        const emailText = `Hi ${homeownerName}, we appreciate you! Leaving a review helps other homeowners choose us: ${reviewLink}`;
        const emailHtml = `
          <html>
            <body>
              <p>Hi ${homeownerName},</p>
              <p>Thanks for choosing us for your roofing project! We'd love to hear about your experience.</p>
              <p>Could you take 20 seconds to leave a Google review? It really helps other homeowners find us.</p>
              <p><a href="${reviewLink}" style="background-color: #4CAF50; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block;">Leave a Review</a></p>
              <p>Thank you!</p>
            </body>
          </html>
        `;

        // Invoke email sending function or use direct email service
        // For now, we'll use the sendEmail shared function pattern
        // This can be integrated with your existing email sending system
        await supabase.functions.invoke("send-email", {
          body: {
            to: homeownerEmail,
            subject: emailSubject,
            text: emailText,
            html: emailHtml,
          },
        });
      } catch (emailError) {
        console.error("Error sending email:", emailError);
        // Continue even if email fails
      }
    }

    return new Response(
      JSON.stringify({ 
        ok: true, 
        review_request_id: reviewRequest.id,
        message: "Review request sent successfully"
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Unexpected error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});


































