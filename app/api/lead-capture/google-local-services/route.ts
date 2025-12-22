// Block 19900 — Google Local Services Leads → Inbox
// POST /api/lead-capture/google-local-services
// Handles GLS leads via email forwarding

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      workspace_id,
      email_subject,
      email_body,
      raw_email_data,
    } = body;

    if (!workspace_id || !email_subject || !email_body) {
      return NextResponse.json(
        { error: "Missing required fields: workspace_id, email_subject, email_body" },
        { status: 400 }
      );
    }

    // Parse email to extract lead information
    const parsedData = parseGLSLeadEmail(email_subject, email_body);

    if (!parsedData.email && !parsedData.phone) {
      return NextResponse.json(
        { error: "Could not extract contact information from email" },
        { status: 400 }
      );
    }

    // Get or create contact
    let contactId: string | null = null;

    if (parsedData.email) {
      const { data: contactIdResult } = await supabase.rpc(
        "get_or_create_contact_from_form",
        {
          p_workspace_id: workspace_id,
          p_email: parsedData.email,
          p_name: parsedData.name,
          p_phone: parsedData.phone,
          p_lead_source: "google_local_services",
        }
      );
      contactId = contactIdResult;
    } else if (parsedData.phone) {
      // Find by phone or create new
      const { data: existingContact } = await supabase
        .from("contacts")
        .select("id")
        .eq("workspace_id", workspace_id)
        .eq("phone", parsedData.phone)
        .maybeSingle();

      if (existingContact) {
        contactId = existingContact.id;
      } else {
        const { data: newContact } = await supabase
          .from("contacts")
          .insert({
            workspace_id,
            phone: parsedData.phone,
            first_name: parsedData.name || null,
            email: null,
            lead_source: "google_local_services",
            source_meta: {
              created_from: "google_local_services",
            },
          })
          .select()
          .single();

        contactId = newContact?.id || null;
      }
    }

    if (!contactId) {
      return NextResponse.json(
        { error: "Failed to create contact" },
        { status: 500 }
      );
    }

    // Store GLS lead
    const { data: glsLead, error: glsLeadError } = await supabase
      .from("google_local_services_leads")
      .insert({
        workspace_id,
        contact_id: contactId,
        email_subject,
        email_body,
        raw_email_data: raw_email_data || {},
        parsed_data: parsedData,
      })
      .select()
      .single();

    if (glsLeadError) {
      console.error("Error storing GLS lead:", glsLeadError);
      return NextResponse.json(
        { error: "Failed to store GLS lead" },
        { status: 500 }
      );
    }

    // Create inbox thread
    const subject = `Google Local Services Lead: ${parsedData.job_type || "New Lead"}`;
    const messageBody = [
      `New lead from Google Local Services`,
      "",
      `**Contact Information:**`,
      `- Name: ${parsedData.name || "Not provided"}`,
      `- Email: ${parsedData.email || "Not provided"}`,
      `- Phone: ${parsedData.phone || "Not provided"}`,
      `- Address: ${parsedData.address || "Not provided"}`,
      "",
      `**Job Details:**`,
      `- Job Type: ${parsedData.job_type || "Not specified"}`,
      "",
      `**Original Email:**`,
      email_body,
    ].join("\n");

    const { data: thread, error: threadError } = await supabase
      .from("inbox_threads")
      .insert({
        workspace_id,
        contact_id: contactId,
        subject,
        status: "open",
        last_message_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (!threadError && thread) {
      // Create initial message
      await supabase.from("inbox_messages").insert({
        thread_id: thread.id,
        sender: parsedData.email || parsedData.phone || "google-local-services",
        body: messageBody,
        sent_at: new Date().toISOString(),
        is_incoming: true,
      });

      // Update GLS lead with thread_id
      await supabase
        .from("google_local_services_leads")
        .update({
          thread_id: thread.id,
          processed: true,
          processed_at: new Date().toISOString(),
        })
        .eq("id", glsLead.id);

      // Run Smart Intake Parser
      await processSmartIntake({
        workspace_id,
        contact_id: contactId,
        thread_id: thread.id,
        source_type: "gls_lead",
        source_id: glsLead.id,
        submission_data: parsedData,
      });

      // Auto-create tasks
      await createTasksForNewLead({
        workspace_id,
        contact_id: contactId,
        thread_id: thread.id,
        submission_data: parsedData,
      });

      // Generate AI draft reply
      await generateAIDraftReply({
        workspace_id,
        thread_id: thread.id,
        contact_id: contactId,
        submission_data: parsedData,
      });
    }

    return NextResponse.json({
      success: true,
      contact_id: contactId,
      thread_id: thread?.id || null,
      gls_lead_id: glsLead.id,
    });
  } catch (error: any) {
    console.error("Error processing GLS lead:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

// Parse Google Local Services lead email
function parseGLSLeadEmail(
  subject: string,
  body: string
): {
  name?: string;
  email?: string;
  phone?: string;
  address?: string;
  job_type?: string;
  description?: string;
} {
  const parsed: any = {};

  // Extract email
  const emailMatch = body.match(/([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9_-]+)/);
  if (emailMatch) {
    parsed.email = emailMatch[1];
  }

  // Extract phone (various formats)
  const phoneMatch = body.match(/(\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4})/);
  if (phoneMatch) {
    parsed.phone = phoneMatch[1].replace(/[^\d]/g, "");
  }

  // Extract name (common patterns)
  const namePatterns = [
    /Name:\s*([^\n]+)/i,
    /Contact:\s*([^\n]+)/i,
    /Customer:\s*([^\n]+)/i,
    /From:\s*([^\n]+)/i,
  ];

  for (const pattern of namePatterns) {
    const match = body.match(pattern);
    if (match) {
      parsed.name = match[1].trim();
      break;
    }
  }

  // Extract address
  const addressPatterns = [
    /Address:\s*([^\n]+)/i,
    /Location:\s*([^\n]+)/i,
    /(\d+\s+[\w\s]+(?:Street|St|Avenue|Ave|Road|Rd|Drive|Dr|Lane|Ln|Boulevard|Blvd|Court|Ct)[^\n]*)/i,
  ];

  for (const pattern of addressPatterns) {
    const match = body.match(pattern);
    if (match) {
      parsed.address = match[1].trim();
      break;
    }
  }

  // Extract job type from subject or body
  const jobTypePatterns = [
    /(roof|roofing|gutter|siding|repair|replacement|inspection)/i,
  ];

  for (const pattern of jobTypePatterns) {
    const match = (subject + " " + body).match(pattern);
    if (match) {
      parsed.job_type = match[1];
      break;
    }
  }

  // Extract description (first few sentences)
  const sentences = body.split(/[.!?]+/).filter((s) => s.trim().length > 20);
  if (sentences.length > 0) {
    parsed.description = sentences.slice(0, 3).join(". ").trim();
  }

  return parsed;
}

// Helper functions (same as other routes)
async function processSmartIntake(params: any) {
  try {
    await fetch(
      `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/api/lead-capture/smart-intake`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(params),
      }
    );
  } catch (error) {
    console.error("Error calling Smart Intake Parser:", error);
  }
}

async function createTasksForNewLead(params: any) {
  try {
    await supabase.from("tasks").insert({
      workspace_id: params.workspace_id,
      contact_id: params.contact_id,
      thread_id: params.thread_id,
      title: "Follow up on Google Local Services lead",
      description: `New lead from Google Local Services`,
      priority: "high",
      status: "open",
      due_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      auto_generated: true,
      auto_source: "google_local_services",
    });
  } catch (error) {
    console.error("Error creating tasks:", error);
  }
}

async function generateAIDraftReply(params: any) {
  try {
    await fetch(
      `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/api/inbox/ai-reply`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          thread_id: params.thread_id,
          contact_id: params.contact_id,
        }),
      }
    );
  } catch (error) {
    console.error("Error generating AI draft reply:", error);
  }
}



















































