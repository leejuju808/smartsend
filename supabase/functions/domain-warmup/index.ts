// Domain Warmup Edge Function
// Auto warm-up logic for new or unsafe domains (Block 11700)
// Gradually increases sending volume to build domain reputation

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const sb = createClient(supabaseUrl, supabaseServiceKey);

interface WarmupSchedule {
  day: number;
  max_emails: number;
  randomization_enabled: boolean;
  followup_delay_hours: number;
}

// Warmup schedule: gradual increase over 14 days
const WARMUP_SCHEDULE: WarmupSchedule[] = [
  { day: 1, max_emails: 5, randomization_enabled: true, followup_delay_hours: 48 },
  { day: 2, max_emails: 8, randomization_enabled: true, followup_delay_hours: 48 },
  { day: 3, max_emails: 12, randomization_enabled: true, followup_delay_hours: 48 },
  { day: 4, max_emails: 15, randomization_enabled: true, followup_delay_hours: 36 },
  { day: 5, max_emails: 20, randomization_enabled: true, followup_delay_hours: 36 },
  { day: 6, max_emails: 25, randomization_enabled: true, followup_delay_hours: 24 },
  { day: 7, max_emails: 30, randomization_enabled: true, followup_delay_hours: 24 },
  { day: 8, max_emails: 40, randomization_enabled: false, followup_delay_hours: 24 },
  { day: 9, max_emails: 50, randomization_enabled: false, followup_delay_hours: 18 },
  { day: 10, max_emails: 60, randomization_enabled: false, followup_delay_hours: 18 },
  { day: 11, max_emails: 75, randomization_enabled: false, followup_delay_hours: 12 },
  { day: 12, max_emails: 90, randomization_enabled: false, followup_delay_hours: 12 },
  { day: 13, max_emails: 100, randomization_enabled: false, followup_delay_hours: 12 },
  { day: 14, max_emails: 0, randomization_enabled: false, followup_delay_hours: 0 }, // 0 = no limit
];

function getWarmupDay(createdAt: string): number {
  const created = new Date(createdAt);
  const now = new Date();
  const diffTime = now.getTime() - created.getTime();
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
  return Math.min(diffDays + 1, 14); // Cap at 14 days
}

function getWarmupSchedule(day: number): WarmupSchedule {
  return WARMUP_SCHEDULE[day - 1] || WARMUP_SCHEDULE[WARMUP_SCHEDULE.length - 1];
}

Deno.serve(async (req) => {
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  };
  
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  
  try {
    const { domain_id } = await req.json();
    
    if (!domain_id) {
      return new Response(
        JSON.stringify({ error: "domain_id is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    
    // Fetch domain settings
    const { data: domain, error: fetchError } = await sb
      .from("domain_settings")
      .select("*")
      .eq("id", domain_id)
      .single();
    
    if (fetchError || !domain) {
      return new Response(
        JSON.stringify({ error: "Domain not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    
    // If domain is verified and not in safe mode, no warmup needed
    if (domain.verification_status === "verified" && !domain.safe_mode) {
      return new Response(
        JSON.stringify({
          warmup_active: false,
          max_emails_per_day: null,
          randomization_enabled: false,
          followup_delay_hours: 0,
          message: "Domain is verified. Warmup not needed.",
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    
    // Calculate warmup day
    const warmupDay = getWarmupDay(domain.created_at);
    const schedule = getWarmupSchedule(warmupDay);
    
    // For safe mode (unverified/partial), use stricter limits
    let maxEmails = schedule.max_emails;
    if (domain.safe_mode) {
      maxEmails = Math.min(maxEmails, 20); // Cap at 20/day in safe mode
    }
    
    return new Response(
      JSON.stringify({
        warmup_active: true,
        warmup_day: warmupDay,
        max_emails_per_day: maxEmails === 0 ? null : maxEmails,
        randomization_enabled: schedule.randomization_enabled,
        followup_delay_hours: schedule.followup_delay_hours,
        safe_mode: domain.safe_mode,
        verification_status: domain.verification_status,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Warmup check error:", error);
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : "Unknown error",
        warmup_active: true,
        max_emails_per_day: 20, // Default safe limit
        randomization_enabled: true,
        followup_delay_hours: 48,
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});





















































