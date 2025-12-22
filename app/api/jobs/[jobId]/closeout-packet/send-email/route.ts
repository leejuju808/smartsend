// Block 45000 — SmartSend Roofing "AI Job Summary + Homeowner Closeout Packet" v1
// API Route: Send closeout packet email to homeowner

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/server";

/**
 * POST /api/jobs/[jobId]/closeout-packet/send-email
 * Send closeout packet email to homeowner
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  try {
    const { jobId } = await params;
    const supabase = createClient();
    const serviceSupabase = createServiceClient();

    // Check authentication
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get closeout packet
    const { data: packet, error: packetError } = await supabase
      .from("closeout_packets")
      .select("*")
      .eq("job_id", jobId)
      .eq("status", "generated")
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (packetError || !packet) {
      return NextResponse.json(
        { error: "Closeout packet not found or not ready" },
        { status: 404 }
      );
    }

    // Get job and lead info
    const { data: job, error: jobError } = await supabase
      .from("roofing_jobs")
      .select(`
        *,
        leads:lead_id (
          id,
          first_name,
          last_name,
          email
        ),
        workspaces:workspace_id (
          id,
          name
        )
      `)
      .eq("id", jobId)
      .single();

    if (jobError || !job) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }

    const lead = job.leads || {};
    const workspace = job.workspaces || {};
    const homeownerEmail = lead.email;

    if (!homeownerEmail) {
      return NextResponse.json(
        { error: "Homeowner email not found" },
        { status: 400 }
      );
    }

    // Get homeowner portal token (if exists)
    const { data: portal } = await supabase
      .from("homeowner_portals")
      .select("portal_token")
      .eq("job_id", jobId)
      .eq("is_enabled", true)
      .limit(1)
      .maybeSingle();

    const portalUrl = portal
      ? `${process.env.NEXT_PUBLIC_APP_URL || "https://app.smartsend.ai"}/homeowner/${portal.portal_token}`
      : null;

    const homeownerName = `${lead.first_name || ""} ${lead.last_name || ""}`.trim() || "Valued Customer";
    const companyName = workspace.name || "Your Roofing Company";

    // Generate email HTML
    const emailHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: linear-gradient(135deg, #2563eb 0%, #1e40af 100%); padding: 30px; text-align: center; border-radius: 8px 8px 0 0;">
    <h1 style="color: white; margin: 0; font-size: 24px;">Your Roof Replacement Summary is Ready!</h1>
  </div>
  
  <div style="background: white; padding: 30px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px;">
    <p style="font-size: 16px; color: #374151; margin-bottom: 20px;">
      Hi ${homeownerName},
    </p>
    
    <p style="font-size: 16px; color: #374151; margin-bottom: 20px;">
      Great news! Your professional closeout packet for your roof replacement is ready. This comprehensive document includes everything you need:
    </p>
    
    <ul style="font-size: 15px; color: #4b5563; line-height: 1.8; margin-bottom: 30px; padding-left: 20px;">
      <li>Complete AI-generated job summary</li>
      <li>Before & after photo layouts</li>
      <li>Materials used breakdown</li>
      <li>What was replaced during the job</li>
      <li>Change order receipts</li>
      <li>Warranty information</li>
      <li>Maintenance recommendations</li>
    </ul>
    
    <div style="text-align: center; margin: 30px 0;">
      <a href="${packet.pdf_url}" 
         style="display: inline-block; background: #2563eb; color: white; padding: 14px 28px; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 16px;">
        Download Your Closeout Packet (PDF)
      </a>
    </div>
    
    ${portalUrl ? `
    <p style="font-size: 14px; color: #6b7280; text-align: center; margin-top: 20px;">
      Or view it in your <a href="${portalUrl}" style="color: #2563eb; text-decoration: underline;">homeowner portal</a>
    </p>
    ` : ''}
    
    <div style="background: #f9fafb; padding: 20px; border-radius: 6px; margin-top: 30px; border-left: 4px solid #2563eb;">
      <p style="font-size: 14px; color: #374151; margin: 0;">
        <strong>💡 Tip:</strong> Save this PDF for your records. It includes all warranty information and maintenance recommendations to keep your new roof in excellent condition.
      </p>
    </div>
    
    <p style="font-size: 14px; color: #6b7280; margin-top: 30px;">
      If you have any questions, please don't hesitate to reach out to us.
    </p>
    
    <p style="font-size: 14px; color: #6b7280; margin-top: 20px;">
      Thank you for choosing ${companyName}!<br>
      <strong>The ${companyName} Team</strong>
    </p>
  </div>
  
  <div style="text-align: center; margin-top: 20px; padding-top: 20px; border-top: 1px solid #e5e7eb;">
    <p style="font-size: 12px; color: #9ca3af;">
      This email was sent regarding your roof replacement project.
    </p>
  </div>
</body>
</html>
    `;

    // Send email (using Resend or your email service)
    const resendApiKey = process.env.RESEND_API_KEY;
    const fromEmail = process.env.EMAIL_FROM || "noreply@smartsend.ai";
    const fromName = companyName;

    if (resendApiKey) {
      try {
        const emailResponse = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${resendApiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from: `${fromName} <${fromEmail}>`,
            to: [homeownerEmail],
            subject: `Your Roof Replacement Summary - ${companyName}`,
            html: emailHtml,
          }),
        });

        if (!emailResponse.ok) {
          const errorText = await emailResponse.text();
          console.error("Email send error:", errorText);
          throw new Error(`Email send failed: ${errorText}`);
        }

        const emailData = await emailResponse.json();

        // Update closeout packet
        await supabase
          .from("closeout_packets")
          .update({
            status: "sent",
            sent_to_homeowner_at: new Date().toISOString(),
            sent_to_email: homeownerEmail,
          })
          .eq("id", packet.id);

        return NextResponse.json({
          success: true,
          message: "Email sent successfully",
          email_id: emailData.id,
        });
      } catch (emailError: any) {
        console.error("Error sending email:", emailError);
        return NextResponse.json(
          { error: `Failed to send email: ${emailError.message}` },
          { status: 500 }
        );
      }
    } else {
      // Fallback: Just update status (email will be sent via another service)
      await supabase
        .from("closeout_packets")
        .update({
          sent_to_homeowner_at: new Date().toISOString(),
          sent_to_email: homeownerEmail,
        })
        .eq("id", packet.id);

      return NextResponse.json({
        success: true,
        message: "Closeout packet marked as sent (email service not configured)",
      });
    }
  } catch (error: any) {
    console.error("Error in POST /api/jobs/[jobId]/closeout-packet/send-email:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
































