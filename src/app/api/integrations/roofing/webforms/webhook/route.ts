/**
 * Web Form Integration Webhook
 * 
 * Handles webhook submissions from:
 * - Gravity Forms
 * - Jotform
 * - Wix Forms
 * - GoHighLevel Forms
 * 
 * Every form submission becomes a SmartSend lead automatically.
 */

import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { integration_id, workspace_id, form_data } = body;

    if (!integration_id || !workspace_id || !form_data) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    const supabase = createRouteHandlerClient({ cookies });

    // Extract lead data from form submission
    const email = form_data.email || form_data.Email || form_data.email_address;
    const first_name = form_data.first_name || form_data.firstName || form_data.FirstName || form_data.fname;
    const last_name = form_data.last_name || form_data.lastName || form_data.LastName || form_data.lname;
    const phone = form_data.phone || form_data.Phone || form_data.phone_number;
    const message = form_data.message || form_data.Message || form_data.comments || form_data.notes;

    if (!email) {
      return NextResponse.json(
        { error: "Email is required in form submission" },
        { status: 400 }
      );
    }

    // Store webform submission
    const { data: submission, error: submissionError } = await supabase
      .from("webform_submissions")
      .insert({
        integration_id,
        workspace_id,
        form_id: form_data.form_id || "unknown",
        form_name: form_data.form_name || "Contact Form",
        submission_id: form_data.submission_id || null,
        email,
        first_name: first_name || null,
        last_name: last_name || null,
        phone: phone || null,
        message: message || null,
        raw_data: form_data
      })
      .select("id")
      .single();

    if (submissionError) {
      console.error("Failed to store webform submission:", submissionError);
      return NextResponse.json(
        { error: "Failed to store submission" },
        { status: 500 }
      );
    }

    // Process lead through unified processing
    const processResponse = await fetch(
      `${req.nextUrl.origin}/api/integrations/roofing/process-lead`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Cookie": req.headers.get("cookie") || ""
        },
        body: JSON.stringify({
          integration_id,
          workspace_id,
          email,
          first_name,
          last_name,
          phone,
          source_type: "webform",
          source_id: submission.id,
          message_text: message,
          metadata: {
            form_id: form_data.form_id,
            form_name: form_data.form_name,
            submission_id: form_data.submission_id
          }
        })
      }
    );

    if (!processResponse.ok) {
      const error = await processResponse.json();
      console.error("Failed to process lead:", error);
    } else {
      // Mark submission as processed
      await supabase
        .from("webform_submissions")
        .update({
          processed: true,
          processed_at: new Date().toISOString()
        })
        .eq("id", submission.id);
    }

    return NextResponse.json({
      success: true,
      submission_id: submission.id,
      message: "Form submission processed successfully"
    });

  } catch (error) {
    console.error("Error processing webform webhook:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}






































