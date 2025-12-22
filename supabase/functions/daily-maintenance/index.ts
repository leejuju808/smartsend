// supabase/functions/daily-maintenance/index.ts
// Daily Maintenance Job
// Runs daily at 4 AM UTC to clean up old data

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(supabaseUrl, supabaseKey);

// Log function execution
async function logFunction(
  fnName: string,
  status: "ok" | "error" | "warning",
  runtimeMs: number,
  errorMessage?: string,
  metadata?: Record<string, any>
) {
  try {
    await supabase.from("function_logs").insert({
      fn_name: fnName,
      status,
      runtime_ms: runtimeMs,
      error_message: errorMessage || null,
      metadata: metadata || {},
    });
  } catch (e) {
    console.error("Failed to log function execution:", e);
  }
}

Deno.serve(async () => {
  const startTime = Date.now();
  const results: Record<string, any> = {};

  try {
    // 1. Delete send_queue rows older than 7 days (status = sent or failed)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const { data: deletedQueue, error: queueError } = await supabase
      .from("send_queue")
      .delete()
      .in("status", ["sent", "failed"])
      .lt("created_at", sevenDaysAgo.toISOString());

    results.send_queue_deleted = deletedQueue || 0;
    if (queueError) {
      console.error("Error deleting old send_queue rows:", queueError);
      results.send_queue_error = queueError.message;
    }

    // 2. Archive old function_logs (older than 30 days) to archive table
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    // Fetch old logs
    const { data: oldLogs, error: fetchError } = await supabase
      .from("function_logs")
      .select("*")
      .lt("created_at", thirtyDaysAgo.toISOString())
      .limit(10000); // Process in batches

    if (fetchError) {
      console.error("Error fetching old function_logs:", fetchError);
      results.archive_fetch_error = fetchError.message;
    } else if (oldLogs && oldLogs.length > 0) {
      // Insert into archive table
      const { error: archiveError } = await supabase
        .from("function_logs_archive")
        .insert(oldLogs);

      if (archiveError) {
        console.error("Error archiving function_logs:", archiveError);
        results.archive_insert_error = archiveError.message;
      } else {
        // Delete from main table after successful archive
        const logIds = oldLogs.map((log) => log.id);
        const { error: deleteError } = await supabase
          .from("function_logs")
          .delete()
          .in("id", logIds);

        if (deleteError) {
          console.error("Error deleting archived logs:", deleteError);
          results.archive_delete_error = deleteError.message;
        } else {
          results.function_logs_archived = oldLogs.length;
        }
      }
    } else {
      results.function_logs_archived = 0;
    }

    const runtimeMs = Date.now() - startTime;
    await logFunction("daily-maintenance", "ok", runtimeMs, undefined, results);

    return new Response(
      JSON.stringify({
        ok: true,
        timestamp: new Date().toISOString(),
        results,
      }),
      {
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    const runtimeMs = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : String(error);

    await logFunction("daily-maintenance", "error", runtimeMs, errorMessage, results);

    return new Response(
      JSON.stringify({
        ok: false,
        error: errorMessage,
        results,
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
});

