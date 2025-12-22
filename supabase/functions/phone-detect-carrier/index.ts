// Supabase Edge Function: Carrier Detection Worker
// Detects carrier and line type for phone numbers

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

    // TODO: Integrate with Twilio Lookup API for real carrier detection
    // For now, use placeholder logic
    let carrierName: string | null = null;
    let carrierType: "wireless" | "landline" | "voip" | null = null;
    let lineType: string = "unknown";
    let confidence = 0.5;

    // Check if we have existing intelligence
    const { data: existing } = await supabase
      .from("phone_intelligence")
      .select("carrier_name, carrier_type, line_type")
      .eq("phone_number", normalized)
      .eq("org_id", orgId)
      .maybeSingle();

    if (existing?.carrier_name) {
      carrierName = existing.carrier_name;
      carrierType = existing.carrier_type as any;
      lineType = existing.line_type;
      confidence = 0.9;
    } else {
      // Placeholder: In production, call Twilio Lookup API
      // const twilioResponse = await fetch(`https://lookups.twilio.com/v1/PhoneNumbers/${normalized}`, {
      //   headers: {
      //     Authorization: `Basic ${btoa(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`)}`,
      //   },
      // });
      // const data = await twilioResponse.json();
      // carrierName = data.carrier?.name;
      // carrierType = data.carrier?.type === 'mobile' ? 'wireless' : 'landline';
    }

    // Detect line type based on carrier
    if (carrierName) {
      const lowerCarrier = carrierName.toLowerCase();
      if (
        lowerCarrier.includes("verizon") ||
        lowerCarrier.includes("at&t") ||
        lowerCarrier.includes("t-mobile") ||
        lowerCarrier.includes("sprint")
      ) {
        lineType = "mobile";
        confidence = 0.9;
      } else if (
        lowerCarrier.includes("comcast") ||
        lowerCarrier.includes("spectrum") ||
        lowerCarrier.includes("frontier")
      ) {
        lineType = "landline";
        confidence = 0.85;
      } else if (lowerCarrier.includes("google voice")) {
        lineType = "google_voice";
        confidence = 0.95;
      } else if (
        lowerCarrier.includes("voip") ||
        lowerCarrier.includes("vonage") ||
        lowerCarrier.includes("ringcentral")
      ) {
        lineType = "voip";
        confidence = 0.8;
      }
    }

    // Determine SMS readiness
    let smsReadiness = "unknown";
    let smsCapable = false;

    if (lineType === "mobile") {
      smsReadiness = "sms_ready";
      smsCapable = true;
    } else if (lineType === "landline") {
      smsReadiness = "landline_no_sms";
      smsCapable = false;
    } else if (lineType === "voip" || lineType === "google_voice") {
      smsReadiness = "voip_unreliable";
      smsCapable = true;
    }

    // Update phone intelligence
    const { data, error } = await supabase
      .from("phone_intelligence")
      .update({
        carrier_name: carrierName,
        carrier_type: carrierType,
        line_type: lineType,
        line_type_confidence: confidence,
        sms_readiness: smsReadiness,
        sms_capable: smsCapable,
        updated_at: new Date().toISOString(),
      })
      .eq("phone_number", normalized)
      .eq("org_id", orgId)
      .select()
      .single();

    if (error) {
      throw error;
    }

    return new Response(
      JSON.stringify({
        success: true,
        carrier: {
          name: carrierName,
          type: carrierType,
        },
        lineType,
        confidence,
        smsReadiness,
        smsCapable,
        phoneIntelligence: data,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Error in phone-detect-carrier:", error);
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





















































