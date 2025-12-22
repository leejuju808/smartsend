import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

serve(async (req) => {
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
  const { campaign_id } = await req.json();

  const { data: samples } = await supabase
    .from("reply_training_labels")
    .select("reply_text, tone")
    .eq("campaign_id", campaign_id)
    .not("tone", "is", null);

  // group by tone for model tuning preview
  const grouped = samples?.reduce((acc, s) => {
    acc[s.tone] = (acc[s.tone] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  return new Response(JSON.stringify({ summary: grouped }), {
    headers: { "Content-Type": "application/json" },
  });
});

