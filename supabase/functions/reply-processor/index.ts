// supabase/functions/reply-processor/index.ts
// Block 10900 — Reply Processor Edge Function
// Stores homeowner reply and classifies it with intent

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error("Missing Supabase configuration");
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const body = await req.json();
    const {
      provider,
      provider_msg_id,
      provider_thread_id,
      from_email,
      to_email,
      subject,
      text_body,
      html_body,
      snippet,
      headers,
      received_at,
      account_id,
      workspace_id,
      campaign_id,
      lead_id,
    } = body;

    if (!from_email || !to_email) {
      return new Response(
        JSON.stringify({ error: "Missing from_email or to_email" }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 400,
        }
      );
    }

    // 1. Store inbound message
    const { data: inboundMessage, error: inboundError } = await supabase
      .from("inbound_messages")
      .insert({
        provider: provider || "unknown",
        provider_msg_id: provider_msg_id || `msg_${Date.now()}`,
        provider_thread_id,
        account_id: account_id || null,
        workspace_id: workspace_id || null,
        identity_id: null, // Will be linked later if needed
        lead_id: lead_id || null,
        campaign_id: campaign_id || null,
        from_email,
        to_email,
        subject,
        snippet: snippet || (text_body ? text_body.substring(0, 200) : null),
        text_body,
        html_body,
        headers: headers || {},
        received_at: received_at || new Date().toISOString(),
      })
      .select()
      .single();

    if (inboundError) {
      console.error("Error storing inbound message:", inboundError);
      return new Response(
        JSON.stringify({ error: "Failed to store message" }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 500,
        }
      );
    }

    // 2. Find or create thread
    let threadId: string | null = null;

    if (lead_id && (account_id || workspace_id)) {
      // Try to find existing thread
      let threadQuery = supabase
        .from("reply_threads")
        .select("id")
        .eq("lead_id", lead_id);

      if (campaign_id) {
        threadQuery = threadQuery.eq("campaign_id", campaign_id);
      }

      if (workspace_id) {
        threadQuery = threadQuery.eq("workspace_id", workspace_id);
      } else if (account_id) {
        threadQuery = threadQuery.eq("account_id", account_id);
      }

      const { data: existingThread } = await threadQuery.maybeSingle();

      if (existingThread) {
        threadId = existingThread.id;
      } else {
        // Create new thread
        const threadPayload: any = {
          lead_id,
          campaign_id: campaign_id || null,
          last_message_at: received_at || new Date().toISOString(),
          snippet: snippet || (text_body ? text_body.substring(0, 120) : null),
          latest_intent: "unclassified",
          status: "open",
          unread_count: 1,
        };

        if (workspace_id) {
          threadPayload.workspace_id = workspace_id;
        }
        if (account_id) {
          threadPayload.account_id = account_id;
        }

        const { data: newThread, error: threadError } = await supabase
          .from("reply_threads")
          .insert(threadPayload)
          .select()
          .single();

        if (newThread) {
          threadId = newThread.id;
        } else if (threadError) {
          console.error("Error creating thread:", threadError);
        }
      }
    }

    // 3. Link inbound message to thread
    if (threadId && inboundMessage) {
      await supabase
        .from("inbound_messages")
        .update({ thread_id: threadId })
        .eq("id", inboundMessage.id);
    }

    // 4. Classify intent (simple keyword-based for now, can be enhanced with AI)
    let classification = "unclassified";
    const messageText = (text_body || snippet || "").toLowerCase();

    if (
      messageText.includes("interested") ||
      messageText.includes("estimate") ||
      messageText.includes("quote") ||
      messageText.includes("come look") ||
      messageText.includes("inspection") ||
      messageText.includes("when can") ||
      messageText.includes("available")
    ) {
      classification = "hot";
    } else if (
      messageText.includes("maybe") ||
      messageText.includes("think") ||
      messageText.includes("consider") ||
      messageText.includes("later")
    ) {
      classification = "warm";
    } else if (
      messageText.includes("not interested") ||
      messageText.includes("no thanks") ||
      messageText.includes("remove") ||
      messageText.includes("unsubscribe")
    ) {
      classification = "not_interested";
    } else if (
      messageText.includes("question") ||
      messageText.includes("how much") ||
      messageText.includes("what") ||
      messageText.includes("?")
    ) {
      classification = "follow_up";
    }

    // 5. Store intent classification
    if (inboundMessage && (workspace_id || account_id)) {
      const intentPayload: any = {
        message_id: inboundMessage.id,
        classification,
        confidence: 0.7, // Default confidence for keyword-based
        created_at: new Date().toISOString(),
      };

      if (threadId) {
        intentPayload.thread_id = threadId;
      }
      if (lead_id) {
        intentPayload.lead_id = lead_id;
      }
      if (campaign_id) {
        intentPayload.campaign_id = campaign_id;
      }
      if (workspace_id) {
        intentPayload.workspace_id = workspace_id;
      }
      if (account_id) {
        intentPayload.account_id = account_id;
      }

      await supabase.from("lead_intents").insert(intentPayload);
    }

    // 6. Update thread with latest intent
    if (threadId && classification !== "unclassified") {
      await supabase
        .from("reply_threads")
        .update({
          latest_intent: classification,
          last_message_at: received_at || new Date().toISOString(),
          snippet: snippet || (text_body ? text_body.substring(0, 120) : null),
          updated_at: new Date().toISOString(),
        })
        .eq("id", threadId);
    }

    return new Response(
      JSON.stringify({
        success: true,
        message_id: inboundMessage.id,
        thread_id: threadId,
        classification,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (error: any) {
    console.error("Reply processor error:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Internal server error" }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      }
    );
  }
});























































