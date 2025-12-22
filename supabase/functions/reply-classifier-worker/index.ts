// supabase/functions/reply-classifier-worker/index.ts

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.48.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// How many replies to process per run
const BATCH_SIZE = 20;

serve(async (_req) => {
  try {
    // 1) Find unclassified inbound replies
    // Build base query
    let query = supabase
      .from("reply_logs")
      .select(
        "id, workspace_id, ai_label, ai_classified_at, received_at"
      )
      .is("ai_label", null)
      .order("received_at", { ascending: true })
      .limit(BATCH_SIZE);

    // Try to filter by direction if the column exists
    // If direction column doesn't exist, query without it
    let { data: replies, error } = await query.eq("direction", "inbound");
    
    // If error suggests direction column doesn't exist, retry without direction filter
    if (error && (error.message?.includes("column") || error.code === "PGRST116")) {
      console.log("[reply-classifier-worker] direction column not found, querying without direction filter");
      const fallbackQuery = supabase
        .from("reply_logs")
        .select(
          "id, workspace_id, ai_label, ai_classified_at, received_at"
        )
        .is("ai_label", null)
        .order("received_at", { ascending: true })
        .limit(BATCH_SIZE);
      
      const fallbackResult = await fallbackQuery;
      replies = fallbackResult.data;
      error = fallbackResult.error;
    }

    if (error) {
      console.error(
        "[reply-classifier-worker] query error",
        error
      );
      return new Response(
        JSON.stringify({ error: "query_failed" }),
        { status: 500 }
      );
    }

    if (!replies || replies.length === 0) {
      return new Response(
        JSON.stringify({ status: "no_unclassified" }),
        { status: 200 }
      );
    }

    let processed = 0;
    let failed = 0;
    for (const r of replies) {
      try {
        const { data, error: fnError } = await supabase.functions.invoke(
          "ai-reply-classify",
          {
            body: {
              reply_id: r.id,
              workspace_id: r.workspace_id,
            },
          }
        );

        if (fnError) {
          failed++;
          console.error(
            "[reply-classifier-worker] ai-reply-classify fnError",
            fnError
          );
          continue;
        }

        processed++;
      } catch (err) {
        failed++;
        console.error(
          "[reply-classifier-worker] invoke error for reply",
          r.id,
          err
        );
      }
    }

    return new Response(
      JSON.stringify({
        status: "ok",
        processed,
        failed,
        batch_size: BATCH_SIZE,
      }),
      { status: 200 }
    );
  } catch (err) {
    console.error("[reply-classifier-worker] error", err);
    return new Response(
      JSON.stringify({ error: "server_error" }),
      { status: 500 }
    );
  }
});

