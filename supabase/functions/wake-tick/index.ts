// supabase/functions/wake-tick/index.ts (optional)
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { 
  auth: { persistSession: false } 
});

Deno.serve(async () => {
  // Wake snoozed threads if RPC exists
  try {
    await supabase.rpc("wake_snoozed_threads");
  } catch (err) {
    // RPC may not exist yet - that's ok
    console.log("wake_snoozed_threads RPC not found, skipping");
  }
  
  // Update heartbeat
  await supabase.from("system_heartbeats").upsert({ 
    worker: "wake-tick", 
    last_ok_at: new Date().toISOString() 
  }, { onConflict: "worker" });
  
  return new Response(JSON.stringify({ ok: true }));
});

