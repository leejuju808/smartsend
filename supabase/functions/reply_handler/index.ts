// supabase/functions/reply_handler/index.ts
// Block 21555 — Reply Handler v1
// When SmartSend receives a homeowner reply, this function processes it through the pipeline engine

import { serve } from "https://deno.land/x/sift@0.6.0/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

const EDGE_URL = Deno.env.get("EDGE_FUNCTIONS_URL") || Deno.env.get("SUPABASE_URL")!;

serve({
  "/": async (req: Request) => {
    if (req.method !== "POST") {
      return new Response("Method Not Allowed", { status: 405 });
    }

    const payload = await req.json().catch(() => null);
    if (!payload || !payload.email) {
      return new Response("invalid payload", { status: 400 });
    }

    const leadEmail = payload.email;
    const messageText = payload.text || payload.message || "";

    if (!messageText) {
      return new Response("missing message text", { status: 400 });
    }

    // 1) Find lead by email
    const { data: lead, error: leadError } = await supabase
      .from("leads")
      .select("*")
      .eq("email", leadEmail.toLowerCase())
      .maybeSingle();

    if (leadError) {
      console.error("Error finding lead:", leadError);
      return new Response("database error", { status: 500 });
    }

    if (!lead) {
      return new Response("no matching lead", { status: 200 });
    }

    // 2) Classify reply
    const classifierUrl = `${EDGE_URL}/reply_classifier`;
    const classRes = await fetch(classifierUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: messageText }),
    });

    if (!classRes.ok) {
      console.error("Classifier failed:", await classRes.text());
      return new Response("classification failed", { status: 500 });
    }

    const classification = await classRes.json();

    // Validate classification structure
    if (!classification.intent || !classification.pipeline_stage) {
      console.error("Invalid classification:", classification);
      return new Response("invalid classification", { status: 500 });
    }

    // 3) Update lead pipeline
    const updateData: any = {
      pipeline_stage: classification.pipeline_stage,
      last_intent: classification.intent,
      last_reply_at: new Date().toISOString(),
      last_message: messageText.substring(0, 5000), // Limit message length
    };

    const { error: updateError } = await supabase
      .from("leads")
      .update(updateData)
      .eq("id", lead.id);

    if (updateError) {
      console.error("Error updating lead:", updateError);
      return new Response("database error", { status: 500 });
    }

    // 4) Activity log - reply
    const activityMessage = `Homeowner replied: ${classification.summary || classification.intent}`;
    const { error: logError1 } = await supabase.from("activity_log").insert({
      lead_id: lead.id,
      user_id: lead.user_id || null,
      type: "reply",
      message: activityMessage,
    });

    if (logError1) {
      console.error("Error logging reply activity:", logError1);
    }

    // 5) Activity log - stage change (if stage changed)
    if (lead.pipeline_stage !== classification.pipeline_stage) {
      const { error: logError2 } = await supabase.from("activity_log").insert({
        lead_id: lead.id,
        user_id: lead.user_id || null,
        type: "stage_change",
        message: `Pipeline moved: ${lead.pipeline_stage || "new"} → ${classification.pipeline_stage}`,
      });

      if (logError2) {
        console.error("Error logging stage change activity:", logError2);
      }
    }

    // 6) Auto-task logic
    if (classification.task_recommendation && classification.task_recommendation !== "none") {
      // Try to find tasks table - it might be named differently
      const taskData: any = {
        lead_id: lead.id,
        user_id: lead.user_id || null,
        type: classification.task_recommendation,
        status: "pending",
        source: "reply_engine_v1",
        title: `Follow-up required: ${classification.intent}`,
        created_at: new Date().toISOString(),
      };

      // Try inserting into tasks table (handle different table structures)
      const { error: taskError } = await supabase
        .from("tasks")
        .insert(taskData);

      if (taskError) {
        // Try alternative table name
        const { error: altTaskError } = await supabase
          .from("follow_up_tasks")
          .insert({
            lead_id: lead.id,
            owner_id: lead.user_id || null,
            title: taskData.title,
            status: "open",
            created_at: new Date().toISOString(),
          });

        if (!altTaskError) {
          // Log task creation
          const { error: logError3 } = await supabase.from("activity_log").insert({
            lead_id: lead.id,
            user_id: lead.user_id || null,
            type: "task_created",
            message: `Task created: ${classification.task_recommendation}`,
          });
          if (logError3) {
            console.error("Error logging task creation:", logError3);
          }
        }
      } else {
        // Log task creation
        const { error: logError4 } = await supabase.from("activity_log").insert({
          lead_id: lead.id,
          user_id: lead.user_id || null,
          type: "task_created",
          message: `Task created: ${classification.task_recommendation}`,
        });
        if (logError4) {
          console.error("Error logging task creation:", logError4);
        }
      }
    }

    return new Response("ok", { status: 200 });
  },
});

