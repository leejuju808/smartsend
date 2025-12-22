// Block 28060 — SmartSend Roofing Review & Referral Engine v1
// Edge Function: Create Referral Lead
// Captures referral form submission and creates new lead

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

Deno.serve(async (req: Request) => {
  try {
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    
    const { referral_code, name, email, phone } = await req.json();

    if (!referral_code || !name || !email) {
      return new Response(
        JSON.stringify({ error: "referral_code, name, and email are required" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Find homeowner by referral code
    const { data: homeowner, error: homeownerError } = await supabase
      .from("homeowner_profiles")
      .select("*")
      .eq("referral_code", referral_code)
      .single();

    if (homeownerError || !homeowner) {
      return new Response(
        JSON.stringify({ error: "Invalid referral code" }),
        { status: 404, headers: { "Content-Type": "application/json" } }
      );
    }

    // Create new lead
    const nameParts = name.trim().split(" ");
    const firstName = nameParts[0] || "";
    const lastName = nameParts.slice(1).join(" ") || "";

    const { data: lead, error: leadError } = await supabase
      .from("leads")
      .insert({
        workspace_id: homeowner.workspace_id,
        email: email.toLowerCase().trim(),
        first_name: firstName,
        last_name: lastName,
        phone: phone || null,
        status: "new",
        source: "referral",
      })
      .select()
      .single();

    if (leadError) {
      console.error("Error creating lead:", leadError);
      return new Response(
        JSON.stringify({ error: leadError.message }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    // Log referral
    const { data: referral, error: referralError } = await supabase
      .from("referrals")
      .insert({
        workspace_id: homeowner.workspace_id,
        referral_code,
        referring_homeowner: homeowner.id,
        new_lead: lead.id,
        status: "new",
      })
      .select()
      .single();

    if (referralError) {
      console.error("Error creating referral:", referralError);
      // Continue even if referral logging fails
    }

    // Increment homeowner referral count
    await supabase.rpc("increment_referral_count", { homeowner_id: homeowner.id });

    // Check if homeowner earned a reward
    const updatedHomeowner = await supabase
      .from("homeowner_profiles")
      .select("referrals_count")
      .eq("id", homeowner.id)
      .single();

    if (updatedHomeowner.data) {
      // Check for pending rewards that might be earned
      const { data: rewards } = await supabase
        .from("referral_rewards")
        .select("*")
        .eq("homeowner_id", homeowner.id)
        .eq("status", "pending");

      if (rewards && rewards.length > 0) {
        for (const reward of rewards) {
          if (updatedHomeowner.data.referrals_count >= reward.referrals_required) {
            // Mark reward as earned
            await supabase
              .from("referral_rewards")
              .update({
                status: "earned",
                referrals_earned: updatedHomeowner.data.referrals_count,
                updated_at: new Date().toISOString(),
              })
              .eq("id", reward.id);
          }
        }
      }
    }

    // TODO: Auto-add lead to campaign if configured
    // This can be done via workflow or separate process

    return new Response(
      JSON.stringify({ 
        ok: true, 
        lead_id: lead.id,
        referral_id: referral?.id,
        message: "Referral lead created successfully"
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Unexpected error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});


































