// Supabase Edge Function: Phone Quality Scoring Worker
// Calculates quality scores for phone numbers

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { persistSession: false },
});

Deno.serve(async (req) => {
  try {
    const { phoneNumber, orgId } = await req.json();

    if (!phoneNumber || !orgId) {
      return new Response(
        JSON.stringify({ error: "phoneNumber and orgId are required" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Normalize phone number
    const normalized = normalizePhoneNumber(phoneNumber);
    if (!normalized) {
      return new Response(
        JSON.stringify({ error: "Invalid phone number format" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Get phone intelligence
    const { data: intelligence, error: intelError } = await supabase
      .from("phone_intelligence")
      .select("*")
      .eq("phone_number", normalized)
      .eq("org_id", orgId)
      .maybeSingle();

    if (intelError || !intelligence) {
      return new Response(
        JSON.stringify({ error: "Phone intelligence not found" }),
        { status: 404, headers: { "Content-Type": "application/json" } }
      );
    }

    // Calculate quality score using database function
    const { data: scoreResult, error: scoreError } = await supabase.rpc(
      "calculate_phone_quality_score",
      {
        p_line_type: intelligence.line_type,
        p_carrier_name: intelligence.carrier_name,
        p_is_valid: intelligence.is_valid,
        p_is_active: intelligence.is_active,
        p_is_disconnected: intelligence.is_disconnected,
        p_sms_readiness: intelligence.sms_readiness,
        p_homeowner_likelihood: intelligence.homeowner_likelihood,
        p_is_spam_risk: intelligence.is_spam_risk,
        p_is_business_line: intelligence.is_business_line,
      }
    );

    if (scoreError) {
      throw scoreError;
    }

    const qualityScore = scoreResult || 0;

    // Calculate spam risk score (simplified)
    let spamRiskScore = 0;
    if (intelligence.is_spam_risk) spamRiskScore += 40;
    if (intelligence.is_temporary) spamRiskScore += 30;
    if (intelligence.line_type === "voip") spamRiskScore += 20;
    if (intelligence.line_type === "burner") spamRiskScore += 30;
    if (intelligence.homeowner_likelihood === "unlikely") spamRiskScore += 20;
    spamRiskScore = Math.min(100, spamRiskScore);

    // Update phone intelligence with scores
    const { data: updated, error: updateError } = await supabase
      .from("phone_intelligence")
      .update({
        quality_score: qualityScore,
        spam_risk_score: spamRiskScore,
        updated_at: new Date().toISOString(),
      })
      .eq("phone_number", normalized)
      .eq("org_id", orgId)
      .select()
      .single();

    if (updateError) {
      throw updateError;
    }

    // Save quality score breakdown
    await supabase.from("phone_quality_scores").upsert(
      {
        phone_intelligence_id: updated.id,
        phone_number: normalized,
        org_id: orgId,
        quality_score: qualityScore,
        spam_risk_score: spamRiskScore,
        score_factors: {
          line_type: intelligence.line_type,
          carrier: intelligence.carrier_name,
          sms_readiness: intelligence.sms_readiness,
          homeowner_likelihood: intelligence.homeowner_likelihood,
        },
        updated_at: new Date().toISOString(),
      },
      {
        onConflict: "phone_intelligence_id",
      }
    );

    // Update contact if linked
    if (intelligence.contact_id) {
      await supabase
        .from("contacts")
        .update({
          phone_quality_score: qualityScore,
        })
        .eq("id", intelligence.contact_id);
    }

    return new Response(
      JSON.stringify({
        success: true,
        qualityScore,
        spamRiskScore,
        phoneIntelligence: updated,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Error in phone-score-quality:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});

function normalizePhoneNumber(phone: string): string | null {
  let cleaned = phone.replace(/[^\d+]/g, "");

  if (cleaned.startsWith("+")) {
    return cleaned;
  }

  if (cleaned.length === 10) {
    return `+1${cleaned}`;
  }

  if (cleaned.length === 11 && cleaned.startsWith("1")) {
    return `+${cleaned}`;
  }

  return null;
}





















































