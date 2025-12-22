// Block 21405 — Auto-Task Generator from Reply Intents
// Edge Function: generate_tasks_from_reply
// Creates tasks automatically based on reply intent classification

import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import { serve } from "https://deno.land/x/sift@0.6.0/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

type IntentLabel =
  | "hot"
  | "warm"
  | "schedule"
  | "followup"
  | "question"
  | "not_interested";

serve({
  "/": async (req: Request) => {
    if (req.method !== "POST") {
      return new Response("Method not allowed", { status: 405 });
    }

    const body = await req.json().catch(() => null);
    if (!body) {
      return new Response("Invalid JSON", { status: 400 });
    }

    const { email_id, user_id, lead_id, intent } = body;

    if (!email_id || !user_id || !intent) {
      return new Response(
        "Missing required fields: email_id, user_id, intent",
        { status: 400 },
      );
    }

    try {
      // Get email details to extract workspace_id and contact_id
      const { data: email, error: emailError } = await supabase
        .from("emails")
        .select("id, workspace_id, lead_id, user_id, subject, body_text")
        .eq("id", email_id)
        .single();

      if (emailError || !email) {
        console.error("Error fetching email:", emailError);
        return new Response(
          JSON.stringify({ error: "Email not found", details: emailError?.message }),
          { status: 404, headers: { "Content-Type": "application/json" } }
        );
      }

      // Get workspace_id (from email or derive from user)
      let workspaceId = email.workspace_id;
      if (!workspaceId) {
        // Try to get workspace from user
        const { data: workspaceMember } = await supabase
          .from("workspace_members")
          .select("workspace_id")
          .eq("user_id", user_id)
          .limit(1)
          .single();
        
        if (workspaceMember) {
          workspaceId = workspaceMember.workspace_id;
        }
      }

      if (!workspaceId) {
        return new Response(
          JSON.stringify({ error: "Could not determine workspace_id" }),
          { status: 400, headers: { "Content-Type": "application/json" } }
        );
      }

      // Get contact_id from lead_id if available
      let contactId: string | null = null;
      if (lead_id) {
        const { data: lead } = await supabase
          .from("leads")
          .select("contact_id")
          .eq("id", lead_id)
          .single();
        
        contactId = lead?.contact_id || null;
      }

      // Skip task creation for not_interested intents
      if (intent === "not_interested") {
        return new Response(
          JSON.stringify({
            status: "skipped",
            reason: "not_interested intent does not require a task",
            intent: intent,
          }),
          { 
            headers: { "Content-Type": "application/json" },
            status: 200
          },
        );
      }

      // Determine task details based on intent
      const taskDetails = getTaskDetailsForIntent(intent as IntentLabel);

      // Calculate due date
      const dueAt = new Date();
      dueAt.setDate(dueAt.getDate() + taskDetails.daysUntilDue);
      dueAt.setHours(9, 0, 0, 0); // Set to 9 AM

      // Create task
      const { data: task, error: taskError } = await supabase
        .from("tasks")
        .insert({
          workspace_id: workspaceId,
          user_id: user_id,
          lead_id: lead_id || null,
          contact_id: contactId,
          title: taskDetails.title,
          description: email.body_text?.slice(0, 500) || null,
          type: taskDetails.type,
          priority: taskDetails.priority,
          status: "open",
          due_at: dueAt.toISOString(),
          due_date: dueAt.toISOString().split("T")[0],
          metadata: {
            email_id: email_id,
            intent: intent,
            auto_generated: true,
            auto_source: "reply_intent_classifier",
          },
          auto_generated: true,
        })
        .select("id")
        .single();

      if (taskError) {
        console.error("Error creating task:", taskError);
        return new Response(
          JSON.stringify({ error: "Task creation failed", details: taskError.message }),
          { status: 500, headers: { "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({
          status: "task_created",
          task_id: task?.id,
          intent: intent,
        }),
        { 
          headers: { "Content-Type": "application/json" },
          status: 200
        },
      );
    } catch (error) {
      console.error("Unexpected error:", error);
      return new Response(
        JSON.stringify({ error: "Internal server error", details: String(error) }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }
  },
});

function getTaskDetailsForIntent(intent: IntentLabel): {
  title: string;
  type: string;
  priority: "low" | "medium" | "high";
  daysUntilDue: number;
} {
  switch (intent) {
    case "hot":
      return {
        title: "Call this lead ASAP",
        type: "call",
        priority: "high",
        daysUntilDue: 0, // Due today
      };
    case "warm":
      return {
        title: "Follow up with warm lead",
        type: "follow_up",
        priority: "medium",
        daysUntilDue: 2,
      };
    case "schedule":
      return {
        title: "Schedule appointment",
        type: "inspection",
        priority: "high",
        daysUntilDue: 1,
      };
    case "question":
      return {
        title: "Answer homeowner question",
        type: "email",
        priority: "medium",
        daysUntilDue: 1,
      };
    case "followup":
      return {
        title: "Follow up needed",
        type: "follow_up",
        priority: "low",
        daysUntilDue: 3,
      };
    case "not_interested":
      // Don't create tasks for not_interested
      return {
        title: "Not interested - no action needed",
        type: "follow_up",
        priority: "low",
        daysUntilDue: 999, // Will be filtered out
      };
    default:
      return {
        title: "Follow up needed",
        type: "follow_up",
        priority: "low",
        daysUntilDue: 3,
      };
  }
}
