import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import OpenAI from "https://deno.land/x/openai@v4.24.1/mod.ts";

const openai = new OpenAI({ apiKey: Deno.env.get("OPENAI_API_KEY")! });
const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

Deno.serve(async (req) => {
  try {
    // Get campaign metrics data
    const { data: metrics, error } = await supabase
      .from("campaign_metrics")
      .select("*")
      .limit(10);

    if (error) {
      console.error("Error fetching metrics:", error);
      return new Response(
        JSON.stringify({ error: "Failed to fetch metrics" }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    const input = JSON.stringify(metrics || [], null, 2);

    const prompt = `You are SmartSend's growth analyst. Given campaign metrics data, create 2 short actionable insights (max 2 sentences each) about what's performing best and what to improve.`;

    const res = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt + "\n\nData:\n" + input }],
    });

    const summary = res.choices[0].message?.content || "No insights generated.";

    return new Response(
      JSON.stringify({ insights: summary }),
      { 
        status: 200, 
        headers: { "Content-Type": "application/json" } 
      }
    );
  } catch (error: any) {
    console.error("Error in ai-dashboard-summary:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Internal server error" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});

