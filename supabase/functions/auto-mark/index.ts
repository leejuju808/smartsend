// functions/auto-mark/index.ts
// Manual batch runs or safety net for marking replies
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const sb = createClient(SUPABASE_URL, SERVICE_KEY);

async function runBatch() {
  // Find inferences that should mark replies but haven't been processed yet
  const { data: inferences, error } = await sb
    .from("reply_brain_inferences")
    .select("id,email_id,intent,confidence")
    .in("intent", ["positive","neutral","negative","question","meeting_interest"])
    .gt("confidence", 0.6)
    .order("created_at", { ascending: true })
    .limit(50);

  if (error) {
    console.error("Error fetching inferences:", error);
    return { count: 0, error: error.message };
  }

  let processed = 0;
  for (const i of inferences || []) {
    try {
      // Call the RPC function to mark as replied
      const { error: rpcError } = await sb.rpc("mark_as_replied", { 
        p_email_id: i.email_id 
      });
      
      if (rpcError) {
        console.error(`Error marking email ${i.email_id} as replied:`, rpcError);
      } else {
        processed++;
      }
    } catch (err) {
      console.error(`Exception processing inference ${i.id}:`, err);
    }
  }

  return { count: processed, total: inferences?.length || 0 };
}

Deno.serve(async (req) => {
  // Verify authorization
  const auth = req.headers.get("Authorization");
  if (auth !== `Bearer ${SERVICE_KEY}`) {
    return new Response("forbidden", { status: 403 });
  }

  try {
    const result = await runBatch();
    return new Response(JSON.stringify(result), { 
      headers: { "Content-Type": "application/json" } 
    });
  } catch (error) {
    console.error("Error in auto-mark function:", error);
    return new Response(
      JSON.stringify({ error: error.message }), 
      { 
        status: 500,
        headers: { "Content-Type": "application/json" } 
      }
    );
  }
});















