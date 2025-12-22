// Block 29572 — SmartSend Roofing "Smart Lead Scoring + Priority Engine" v1
// Edge Function: Route leads based on score thresholds
// Auto-actions: Create tasks, send notifications, trigger workflows

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } }
);

Deno.serve(async (req) => {
  try {
    const { lead_id, score } = await req.json();

    if (!lead_id || score === undefined) {
      return new Response(
        JSON.stringify({ error: "lead_id and score are required" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const actions: string[] = [];

    // PRIORITY (Score 70-100) → Create call task + Notify owner
    if (score >= 70) {
      // Create call task (if tasks table exists)
      try {
        const { error: taskError } = await supabase
          .from("tasks")
          .insert({
            lead_id,
            title: "High Priority Lead - Call Immediately",
            description: `Lead scored ${score}/100. High priority - ready to close.`,
            priority: "high",
            due_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(), // 1 hour from now
            status: "pending",
          });

        if (!taskError) {
          actions.push("created_call_task");
        }
      } catch (error) {
        console.warn("Could not create task (table may not exist):", error);
      }

      // Notify owner (if notifications table exists)
      try {
        // Get lead owner/workspace
        const { data: leadData } = await supabase
          .from("leads")
          .select("workspace_id, email, name")
          .eq("id", lead_id)
          .single();

        if (leadData?.workspace_id) {
          // Get workspace owner
          const { data: ownerData } = await supabase
            .from("workspace_members")
            .select("user_id")
            .eq("workspace_id", leadData.workspace_id)
            .eq("role", "owner")
            .limit(1)
            .single();

          if (ownerData?.user_id) {
            const { error: notifError } = await supabase
              .from("notifications")
              .insert({
                user_id: ownerData.user_id,
                title: "🔥 Priority Lead Ready",
                message: `${leadData.name || leadData.email} scored ${score}/100 - Call now!`,
                type: "priority_lead",
                metadata: { lead_id, score },
                read: false,
              });

            if (!notifError) {
              actions.push("notified_owner");
            }
          }
        }
      } catch (error) {
        console.warn("Could not send notification (table may not exist):", error);
      }

      // Send SMS notification (if SMS function exists)
      // This would require additional setup - placeholder for now
      actions.push("priority_lead_detected");
    }

    // WARM (Score 40-69) → Send personalized info email
    if (score >= 40 && score < 70) {
      try {
        // Get lead details
        const { data: leadData } = await supabase
          .from("leads")
          .select("email, name, workspace_id")
          .eq("id", lead_id)
          .single();

        if (leadData) {
          // Check if email was already sent (avoid duplicates)
          const { data: existingEmail } = await supabase
            .from("send_logs")
            .select("id")
            .eq("lead_id", lead_id)
            .eq("template_key", "warm_lead_info_packet")
            .gte("sent_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()) // Last 24 hours
            .limit(1)
            .single();

          if (!existingEmail) {
            // Queue warm lead email
            const { error: emailError } = await supabase
              .from("send_queue")
              .insert({
                lead_id,
                workspace_id: leadData.workspace_id,
                to_email: leadData.email,
                subject: `Information about your roofing project`,
                body_html: `
                  <p>Hi ${leadData.name || "there"},</p>
                  <p>Thanks for your interest! Here's some helpful information about our roofing services.</p>
                  <p>Would you like to schedule a free inspection?</p>
                `,
                status: "pending",
                scheduled_at: new Date().toISOString(),
              });

            if (!emailError) {
              actions.push("queued_warm_email");
            }
          }
        }
      } catch (error) {
        console.warn("Could not queue warm email:", error);
      }
    }

    // COLD (Score < 10) → Send "Last chance" message
    if (score < 10) {
      try {
        const { data: leadData } = await supabase
          .from("leads")
          .select("email, name, workspace_id")
          .eq("id", lead_id)
          .single();

        if (leadData) {
          // Check if last chance was already sent
          const { data: existingEmail } = await supabase
            .from("send_logs")
            .select("id")
            .eq("lead_id", lead_id)
            .eq("template_key", "last_chance_message")
            .limit(1)
            .single();

          if (!existingEmail) {
            const { error: emailError } = await supabase
              .from("send_queue")
              .insert({
                lead_id,
                workspace_id: leadData.workspace_id,
                to_email: leadData.email,
                subject: "Last chance to get your roof fixed",
                body_html: `
                  <p>Hi ${leadData.name || "there"},</p>
                  <p>This will be our last message. If you still need help with your roof, we're here.</p>
                  <p>Otherwise, we'll close your file. Thanks!</p>
                `,
                status: "pending",
                scheduled_at: new Date().toISOString(),
              });

            if (!emailError) {
              actions.push("queued_last_chance_email");
            }
          }
        }
      } catch (error) {
        console.warn("Could not queue last chance email:", error);
      }
    }

    return new Response(
      JSON.stringify({
        ok: true,
        lead_id,
        score,
        actions,
      }),
      { headers: { "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error in score-router:", error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});


































