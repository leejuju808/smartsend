// Block 19900 — Web Form Submission → Inbox
// POST /api/lead-capture/form-submit
// Handles form submissions and creates inbox threads

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { form_slug, workspace_id, submission_data } = body;

    if (!form_slug || !workspace_id || !submission_data) {
      return NextResponse.json(
        { error: "Missing required fields: form_slug, workspace_id, submission_data" },
        { status: 400 }
      );
    }

    // Get form configuration
    const { data: form, error: formError } = await supabase
      .from("lead_capture_forms")
      .select("*")
      .eq("workspace_id", workspace_id)
      .eq("form_slug", form_slug)
      .eq("is_active", true)
      .single();

    if (formError || !form) {
      return NextResponse.json(
        { error: "Form not found or inactive" },
        { status: 404 }
      );
    }

    // Extract form data
    const email = submission_data.email?.toLowerCase().trim();
    const name = submission_data.name || submission_data.first_name || "";
    const phone = submission_data.phone || "";
    const address = submission_data.address || "";
    const job_type = submission_data.job_type || "";
    const description = submission_data.description || "";
    const preferred_time = submission_data.preferred_time || "";

    if (!email) {
      return NextResponse.json(
        { error: "Email is required" },
        { status: 400 }
      );
    }

    // Get or create contact
    const { data: contactId } = await supabase.rpc(
      "get_or_create_contact_from_form",
      {
        p_workspace_id: workspace_id,
        p_email: email,
        p_name: name,
        p_phone: phone,
        p_lead_source: "web_form",
      }
    );

    if (!contactId) {
      return NextResponse.json(
        { error: "Failed to create contact" },
        { status: 500 }
      );
    }

    // Create form submission record
    const { data: submission, error: submissionError } = await supabase
      .from("lead_form_submissions")
      .insert({
        workspace_id,
        form_id: form.id,
        contact_id: contactId,
        submission_data,
      })
      .select()
      .single();

    if (submissionError) {
      console.error("Error creating submission:", submissionError);
      return NextResponse.json(
        { error: "Failed to create submission" },
        { status: 500 }
      );
    }

    let threadId: string | null = null;

    // Create inbox thread if enabled
    if (form.auto_create_thread) {
      // Build thread subject
      const subject = job_type
        ? `New Lead: ${job_type}`
        : "New Lead Form Submission";

      // Build message body
      const messageBody = [
        `New lead form submission from ${name || email}`,
        "",
        `**Contact Information:**`,
        `- Name: ${name || "Not provided"}`,
        `- Email: ${email}`,
        `- Phone: ${phone || "Not provided"}`,
        `- Address: ${address || "Not provided"}`,
        "",
        `**Job Details:**`,
        `- Job Type: ${job_type || "Not specified"}`,
        `- Description: ${description || "None"}`,
        `- Preferred Time: ${preferred_time || "Not specified"}`,
      ].join("\n");

      // Create or find thread
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
        threadId = thread.id;

        // Create initial message
        await supabase.from("inbox_messages").insert({
          thread_id: thread.id,
          sender: email,
          body: messageBody,
          sent_at: new Date().toISOString(),
          is_incoming: true,
        });

        // Update submission with thread_id
        await supabase
          .from("lead_form_submissions")
          .update({ thread_id: thread.id })
          .eq("id", submission.id);
      }
    }

    // Run Smart Intake Parser if enabled
    if (form.auto_score_lead && threadId) {
      // Trigger Smart Intake Parser (async)
      await processSmartIntake({
        workspace_id,
        contact_id: contactId,
        thread_id: threadId,
        source_type: "form_submission",
        source_id: submission.id,
        submission_data,
      });
    }

    // Auto-create tasks if enabled
    if (form.auto_create_tasks && threadId) {
      await createTasksForNewLead({
        workspace_id,
        contact_id: contactId,
        thread_id: threadId,
        submission_data,
      });
    }

    // Generate AI draft reply if enabled
    if (form.auto_generate_ai_reply && threadId) {
      // Trigger AI reply generation (async)
      await generateAIDraftReply({
        workspace_id,
        thread_id: threadId,
        contact_id: contactId,
        submission_data,
      });
    }

    // Notify owner if enabled
    if (form.notify_owner) {
      await notifyOwner({
        workspace_id,
        contact_id: contactId,
        thread_id: threadId,
        submission_data,
      });
    }

    // Mark submission as processed
    await supabase
      .from("lead_form_submissions")
      .update({
        processed: true,
        processed_at: new Date().toISOString(),
      })
      .eq("id", submission.id);

    return NextResponse.json({
      success: true,
      contact_id: contactId,
      thread_id: threadId,
      submission_id: submission.id,
    });
  } catch (error: any) {
    console.error("Error processing form submission:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

// Helper: Process Smart Intake Parser
async function processSmartIntake(params: {
  workspace_id: string;
  contact_id: string;
  thread_id: string;
  source_type: string;
  source_id: string;
  submission_data: any;
}) {
  try {
    // Call Smart Intake Parser API
    const response = await fetch(
      `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/api/lead-capture/smart-intake`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(params),
      }
    );

    if (!response.ok) {
      console.error("Smart Intake Parser failed:", await response.text());
    }
  } catch (error) {
    console.error("Error calling Smart Intake Parser:", error);
  }
}

// Helper: Create tasks for new lead
async function createTasksForNewLead(params: {
  workspace_id: string;
  contact_id: string;
  thread_id: string;
  submission_data: any;
}) {
  try {
    const tasks = [];

    // Task: Follow up on lead
    tasks.push({
      workspace_id: params.workspace_id,
      contact_id: params.contact_id,
      thread_id: params.thread_id,
      title: "Follow up on new lead",
      description: `New lead submitted via form. Job type: ${params.submission_data.job_type || "Not specified"}`,
      priority: "high",
      status: "open",
      due_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // 24 hours
      auto_generated: true,
      auto_source: "form_submission",
    });

    // Task: Schedule inspection if job type is inspection
    if (params.submission_data.job_type?.toLowerCase().includes("inspection")) {
      tasks.push({
        workspace_id: params.workspace_id,
        contact_id: params.contact_id,
        thread_id: params.thread_id,
        title: "Schedule roof inspection",
        description: "Lead requested inspection",
        priority: "high",
        status: "open",
        due_at: new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString(), // 12 hours
        auto_generated: true,
        auto_source: "form_submission",
      });
    }

    // Create tasks
    for (const task of tasks) {
      await supabase.from("tasks").insert(task);
    }
  } catch (error) {
    console.error("Error creating tasks:", error);
  }
}

// Helper: Generate AI draft reply
async function generateAIDraftReply(params: {
  workspace_id: string;
  thread_id: string;
  contact_id: string;
  submission_data: any;
}) {
  try {
    // Call AI draft reply API
    const response = await fetch(
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

    if (!response.ok) {
      console.error("AI draft reply generation failed:", await response.text());
    }
  } catch (error) {
    console.error("Error generating AI draft reply:", error);
  }
}

// Helper: Notify owner
async function notifyOwner(params: {
  workspace_id: string;
  contact_id: string;
  thread_id: string | null;
  submission_data: any;
}) {
  try {
    // Get workspace owner
    const { data: workspace } = await supabase
      .from("workspaces")
      .select("owner_id")
      .eq("id", params.workspace_id)
      .single();

    if (!workspace?.owner_id) return;

    // Create notification (if notifications table exists)
    // This is a placeholder - implement based on your notification system
    console.log("Notify owner:", workspace.owner_id, "about new lead");
  } catch (error) {
    console.error("Error notifying owner:", error);
  }
}



















































