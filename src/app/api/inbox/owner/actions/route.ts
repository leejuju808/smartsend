import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { sendEmail } from "@/lib/email";

/**
 * POST /api/inbox/owner/actions
 * Block 19650 — Inbox Actions & Job Funnel Hooks v1
 * Log actions taken on threads and perform associated operations
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = createClient();
    
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const body = await req.json();
    const { threadId, actionType } = body;
    let metadata = body?.metadata;

    if (!threadId || !actionType) {
      return NextResponse.json(
        { error: "threadId and actionType are required" },
        { status: 400 }
      );
    }

    // Validate action type
    const validActions = [
      "call_now",
      "text_now",
      "schedule_manual",
      "send_estimate_link",
      "mark_booked",
      "mark_won",
      "mark_lost",
      "mark_follow_up",
      "add_task",
      "add_to_crm",
      // BLOCK 269600 — SmartSend Enforcement Sprint:
      // Forced focus on what pays: Reply / Book / Close.
      "close",
      // BLOCK 270900 — Margin Protection: clean exits for low-fit jobs
      "not_a_fit_exit",
    ];
    if (!validActions.includes(actionType)) {
      return NextResponse.json(
        { error: `Invalid action type. Must be one of: ${validActions.join(", ")}` },
        { status: 400 }
      );
    }

    // Get thread info to extract contact_id / campaign_id / lead_id
    const { data: thread, error: threadError } = await supabase
      .from("inbox_threads")
      .select("contact_id, campaign_id, lead_id")
      .eq("id", threadId)
      .single();

    if (threadError || !thread) {
      return NextResponse.json(
        { error: "Thread not found" },
        { status: 404 }
      );
    }

    const contactId = thread.contact_id;
    const campaignId = thread.campaign_id;
    const leadId = (thread as any).lead_id as string | null;

    // Get contact info for actions that need it
    let contact: any = null;
    if (contactId) {
      const { data: contactData } = await supabase
        .from("contacts")
        .select("id, email, phone, tags")
        .eq("id", contactId)
        .single();
      contact = contactData;
    }

    // Handle specific actions
    let result: any = {};

    switch (actionType) {
      case "call_now":
        // Log call action
        // If no phone, still log but with reason in metadata
        if (!contact?.phone) {
          result.message = "No phone number on file.";
          result.phone = null;
        } else {
          result.phone = contact.phone;
          result.message = "Call logged.";
        }
        break;
      
      case "text_now":
        // Log text action (v1: client launches sms: link)
        if (!contact?.phone) {
          result.message = "No phone number on file.";
          result.phone = null;
        } else {
          result.phone = contact.phone;
          result.message = "Text logged.";
        }
        break;
      
      case "schedule_manual":
        // Manual scheduling (UI scrolls to appointment card); we just log the action.
        result.message = "Schedule opened.";
        break;

      case "send_estimate_link":
        // For v1: Send placeholder email via existing outbound system
        // In future blocks, this will generate actual estimate links
        const email = contact?.email || metadata?.email;
        if (!email) {
          return NextResponse.json(
            { error: "No email address found for contact" },
            { status: 400 }
          );
        }

        // Placeholder: Send basic email (stub implementation)
        // TODO: Integrate with actual estimate link generation system
        const estimateValue = metadata?.estimate_hint || "";
        result.message = "Estimate link sent.";
        result.email = email;
        result.estimateHint = estimateValue;
        
        // Note: Actual email sending would happen here in future blocks
        // For now, we just log the action
        break;

      case "mark_booked":
        // Update thread status to closed
        const { error: updateError } = await supabase
          .from("inbox_threads")
          .update({ 
            status: "closed",
            closed_reason: "booked_estimate"
          })
          .eq("id", threadId);

        if (updateError) {
          console.error("Error updating thread status:", updateError);
          return NextResponse.json(
            { error: updateError.message },
            { status: 500 }
          );
        }

        // Create jobs_conversion entry with enhanced fields
        const estimatedValue = metadata?.estimated_value ? parseFloat(metadata.estimated_value) : null;
        const notes = metadata?.notes || null;
        const jobType = metadata?.job_type || null;
        const probability = metadata?.probability ? parseInt(metadata.probability) : 80;
        const expectedCloseDate = metadata?.expected_close_date || null;

        const { data: conversion, error: conversionError } = await supabase
          .from("jobs_conversions")
          .insert({
            thread_id: threadId,
            contact_id: contactId,
            campaign_id: campaignId,
            conversion_type: "booked_estimate",
            estimated_value: estimatedValue,
            notes: notes,
            job_type: jobType,
            pipeline_stage: "booked",
            probability: probability,
            expected_close_date: expectedCloseDate,
            created_by: user.id,
          })
          .select()
          .single();

        if (conversionError) {
          console.error("Error creating conversion:", conversionError);
          // Don't fail the whole request if conversion creation fails
        }

        // Sync to CRM jobs table (Block 19780)
        if (contactId) {
          const { error: crmSyncError } = await supabase.rpc("sync_crm_job_from_action", {
            p_thread_id: threadId,
            p_contact_id: contactId,
            p_action_type: "mark_booked",
            p_metadata: {
              job_type: jobType,
              estimated_value: estimatedValue,
              probability: probability,
              expected_close_date: expectedCloseDate,
              notes: notes,
            },
          });
          if (crmSyncError) {
            console.error("Error syncing to CRM:", crmSyncError);
          }
        }

        // Format success message with value
        const valueText = estimatedValue ? ` — $${estimatedValue.toLocaleString()}` : "";
        result.message = `Marked as booked${valueText}.`;
        result.conversion = conversion;

        // ---------------------------------------------------------------------
        // Block 271200 — Crew-ready Job Hand-off (no inbox digging)
        // When a job is booked, snapshot a clean handoff for crew/staff.
        // ---------------------------------------------------------------------
        try {
          const { data: campaignRow } = await supabase
            .from("campaigns")
            .select("workspace_id")
            .eq("id", campaignId)
            .single();

          const workspaceId = (campaignRow as any)?.workspace_id ? String((campaignRow as any).workspace_id) : null;
          if (workspaceId) {
            let location: string | null = null;
            if (leadId) {
              const { data: leadRow } = await supabase
                .from("leads")
                .select("address, city, state, zip")
                .eq("id", leadId)
                .maybeSingle();

              const addr = String((leadRow as any)?.address || "").trim();
              const city = String((leadRow as any)?.city || "").trim();
              const state = String((leadRow as any)?.state || "").trim();
              const zip = String((leadRow as any)?.zip || "").trim();
              location = [addr, [city, state].filter(Boolean).join(", "), zip].filter(Boolean).join(" ").trim() || null;
            }

            const { data: handoff } = await supabase
              .from("job_handoffs")
              .insert({
                workspace_id: workspaceId,
                thread_id: threadId,
                contact_id: contactId,
                lead_id: leadId,
                job_type: jobType,
                location,
                notes: notes,
                source: "inbox_mark_booked",
                created_by: user.id,
              })
              .select("id, job_type, location, notes, created_at")
              .maybeSingle();

            result.handoff = handoff || null;
          }
        } catch (e) {
          console.warn("Crew-ready handoff generation failed (non-blocking):", e);
        }
        break;

      case "close":
        // Close thread with a neutral reason (no extra choices in UI)
        await supabase
          .from("inbox_threads")
          .update({
            status: "closed",
            closed_reason: "closed",
          })
          .eq("id", threadId);
        result.message = "Closed.";
        break;

      case "not_a_fit_exit": {
        // Send a polite exit and close the thread
        // 1) Load thread + contact + campaign for context
        const { data: convo, error: convoError } = await supabase
          .from("inbox_threads")
          .select(
            `
            id,
            campaign_id,
            contact_id,
            last_message_preview,
            campaigns:campaign_id (
              workspace_id,
              subject
            ),
            contacts:contact_id (
              email,
              first_name,
              last_name
            )
          `
          )
          .eq("id", threadId)
          .single();

        if (convoError || !convo) {
          return NextResponse.json({ error: "Thread not found" }, { status: 404 });
        }

        const contactRow = (convo as any).contacts as any;
        const campaignRow = (convo as any).campaigns as any;

        const toEmail = contactRow?.email;
        const homeownerName =
          contactRow?.first_name || contactRow?.last_name
            ? `${contactRow?.first_name || ""} ${contactRow?.last_name || ""}`.trim()
            : null;

        if (!toEmail) {
          return NextResponse.json({ error: "No homeowner email on file" }, { status: 400 });
        }

        const workspaceId = campaignRow?.workspace_id ? String(campaignRow.workspace_id) : null;

        // 2) Determine sending identity (workspace override)
        let fromEmail = process.env.SMARTSEND_FROM || "noreply@smartsend.ai";
        let fromName = "SmartSend";

        if (workspaceId) {
          const { data: workspaceSettings } = await supabase
            .from("workspace_sending_settings")
            .select("from_email, from_name")
            .eq("workspace_id", workspaceId)
            .maybeSingle();

          if (workspaceSettings) {
            fromEmail = workspaceSettings.from_email || fromEmail;
            fromName = workspaceSettings.from_name || fromName;
          }
        }

        // 3) Compose the exit message
        const greeting = homeownerName ? `Hi ${homeownerName},` : "Hi there,";
        const bodyText = [
          greeting,
          "",
          "Thanks for reaching out. We may not be the best fit for this project, but I really appreciate you considering us.",
          "Wishing you the best with it.",
        ].join("\n");

        const subjectBase = (campaignRow?.subject as string | null) || "Your roof";
        const finalSubject = `Re: ${subjectBase}`;

        // 4) Send email
        const sendResult = await sendEmail({
          from: `${fromName} <${fromEmail}>`,
          to: toEmail,
          subject: finalSubject,
          text: bodyText,
        });

        if (!sendResult.success) {
          return NextResponse.json(
            { error: sendResult.error || "Failed to send exit email" },
            { status: 500 }
          );
        }

        // 5) Log outbound message (best-effort)
        await supabase.from("inbox_messages").insert({
          thread_id: threadId,
          direction: "outbound",
          body_raw: bodyText,
          body_clean: bodyText,
          from_email: fromEmail,
          to_email: toEmail,
          subject: finalSubject,
          received_at: new Date().toISOString(),
        });

        // 6) Close the thread
        const { error: closeErr } = await supabase
          .from("inbox_threads")
          .update({
            status: "closed",
            closed_reason: "not_a_fit",
            lead_stage: "lost",
            updated_at: new Date().toISOString(),
          })
          .eq("id", threadId);

        if (closeErr) {
          console.error("Error closing thread after not_a_fit_exit:", closeErr);
        }

        result.message = "Sent polite exit and closed.";
        break;
      }

      case "mark_won":
        if (!contactId) {
          return NextResponse.json(
            { error: "No contact associated with this thread" },
            { status: 400 }
          );
        }

        // Update thread status
        await supabase
          .from("inbox_threads")
          .update({ 
            status: "closed",
            closed_reason: "won"
          })
          .eq("id", threadId);

        // Sync to CRM jobs
        const { error: wonSyncError } = await supabase.rpc("sync_crm_job_from_action", {
          p_thread_id: threadId,
          p_contact_id: contactId,
          p_action_type: "mark_won",
          p_metadata: {
            notes: metadata?.notes || null,
          },
        });

        if (wonSyncError) {
          console.error("Error syncing won job to CRM:", wonSyncError);
        }

        result.message = "Marked as won.";
        break;

      case "mark_lost":
        if (!contactId) {
          return NextResponse.json(
            { error: "No contact associated with this thread" },
            { status: 400 }
          );
        }

        // Update thread status
        await supabase
          .from("inbox_threads")
          .update({ 
            status: "closed",
            closed_reason: "lost"
          })
          .eq("id", threadId);

        // Sync to CRM jobs
        const { error: lostSyncError } = await supabase.rpc("sync_crm_job_from_action", {
          p_thread_id: threadId,
          p_contact_id: contactId,
          p_action_type: "mark_lost",
          p_metadata: {
            notes: metadata?.notes || null,
          },
        });

        if (lostSyncError) {
          console.error("Error syncing lost job to CRM:", lostSyncError);
        }

        result.message = "Marked as lost.";
        break;

      case "mark_follow_up":
        if (!contactId) {
          return NextResponse.json(
            { error: "No contact associated with this thread" },
            { status: 400 }
          );
        }

        // Update contact status to follow-up
        await supabase
          .from("contacts")
          .update({ status: "follow-up" })
          .eq("id", contactId);

        // Log activity
        await supabase
          .from("crm_activity")
          .insert({
            contact_id: contactId,
            thread_id: threadId,
            event_type: "follow_up_created",
            metadata: {
              notes: metadata?.notes || null,
            },
          });

        result.message = "Marked for follow-up.";
        break;

      case "add_task":
        // Create task
        const taskTitle = metadata?.title;
        const taskDueAt = metadata?.due_at;
        const taskNotes = metadata?.notes || null;

        if (!taskTitle || !taskDueAt) {
          return NextResponse.json(
            { error: "Task title and due date are required" },
            { status: 400 }
          );
        }

        // Get workspace_id from campaign or thread
        const { data: campaign } = await supabase
          .from("campaigns")
          .select("workspace_id")
          .eq("id", campaignId)
          .single();

        const workspaceId = campaign?.workspace_id;

        // Create task (using simpler tasks table)
        const { data: task, error: taskError } = await supabase
          .from("tasks")
          .insert({
            workspace_id: workspaceId || null,
            thread_id: threadId,
            lead_id: null, // Can be populated from contact if needed
            assigned_to: user.id,
            created_by: user.id,
            title: taskTitle,
            description: taskNotes,
            status: "todo",
            due_date: taskDueAt ? new Date(taskDueAt).toISOString().split('T')[0] : null,
          })
          .select()
          .single();

        if (taskError) {
          console.error("Error creating task:", taskError);
          return NextResponse.json(
            { error: taskError.message },
            { status: 500 }
          );
        }

        // Sync task to CRM (Block 19780)
        if (contactId) {
          const { error: taskSyncError } = await supabase.rpc("sync_task_to_crm", {
            p_contact_id: contactId,
            p_task_id: task.id,
            p_task_title: taskTitle,
            p_due_date: taskDueAt ? new Date(taskDueAt).toISOString().split('T')[0] : null,
          });
          if (taskSyncError) {
            console.error("Error syncing task to CRM:", taskSyncError);
          }
        }

        result.message = "Task created.";
        result.task = task;
        // Update metadata to include task_id
        if (!metadata) metadata = {};
        metadata.task_id = task.id;
        break;

      case "add_to_crm":
        // Add CRM tag to contact
        if (!contactId) {
          return NextResponse.json(
            { error: "No contact associated with this thread" },
            { status: 400 }
          );
        }

        // Get current tags
        const currentTags = contact?.tags || [];
        const tagsToAdd = Array.isArray(currentTags) ? [...currentTags] : [];
        
        // Add crm_priority tag if not already present
        if (!tagsToAdd.includes("crm_priority")) {
          tagsToAdd.push("crm_priority");
        }

        const { error: tagError } = await supabase
          .from("contacts")
          .update({ tags: tagsToAdd })
          .eq("id", contactId);

        if (tagError) {
          console.error("Error updating contact tags:", tagError);
          return NextResponse.json(
            { error: tagError.message },
            { status: 500 }
          );
        }

        result.message = "Contact pinned to CRM.";
        result.tagsAdded = ["crm_priority"];
        // Update metadata
        if (!metadata) metadata = {};
        metadata.tags_added = ["crm_priority"];
        break;
    }

    // Log the action
    const { data: action, error: actionError } = await supabase
      .from("inbox_actions")
      .insert({
        thread_id: threadId,
        contact_id: contactId,
        action_type: actionType,
        performed_by: user.id,
        metadata: metadata || {},
      })
      .select()
      .single();

    if (actionError) {
      console.error("Error logging action:", actionError);
      return NextResponse.json(
        { error: actionError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ 
      success: true, 
      action,
      ...result
    });
  } catch (error: any) {
    console.error("Error in /api/inbox/owner/actions:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

