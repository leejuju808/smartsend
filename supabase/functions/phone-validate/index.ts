// Supabase Edge Function: Phone Validation Worker
// Validates phone numbers and updates phone_intelligence table

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { persistSession: false },
});

Deno.serve(async (req) => {
  try {
    const { phoneNumber, orgId, contactId } = await req.json();

    if (!phoneNumber || !orgId) {
      return new Response(
        JSON.stringify({ error: "phoneNumber and orgId are required" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Normalize phone number (E.164 format)
    const normalized = normalizePhoneNumber(phoneNumber);
    if (!normalized) {
      return new Response(
        JSON.stringify({ error: "Invalid phone number format" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Basic validation
    const e164Regex = /^\+1[2-9]\d{2}[2-9]\d{2}\d{4}$/;
    const isValid = e164Regex.test(normalized);

    // Check for temporary/burner patterns
    const digits = normalized.replace(/\D/g, "");
    const isTemporary =
      /(\d)\1{4,}/.test(digits) ||
      /12345|54321/.test(digits) ||
      /0000|1111|2222|3333|4444|5555|6666|7777|8888|9999/.test(digits);

    // TODO: Integrate with Twilio Lookup API for real validation
    // For now, use basic validation
    const isActive = isValid ? true : null;
    const isReachable = isValid ? true : null;
    const isDisconnected = !isValid;

    // Update or insert phone intelligence
    const { data, error } = await supabase
      .from("phone_intelligence")
      .upsert(
        {
          phone_number: normalized,
          org_id: orgId,
          contact_id: contactId || null,
          is_valid: isValid,
          is_active: isActive,
          is_reachable: isReachable,
          is_disconnected: isDisconnected,
          is_temporary: isTemporary,
          validation_source: "edge_function",
          last_validated_at: new Date().toISOString(),
        },
        {
          onConflict: "phone_number,org_id",
        }
      )
      .select()
      .single();

    if (error) {
      throw error;
    }

    return new Response(
      JSON.stringify({
        success: true,
        phoneIntelligence: data,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Error in phone-validate:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});

function normalizePhoneNumber(phone: string): string | null {
  // Remove all non-digit characters except +
  let cleaned = phone.replace(/[^\d+]/g, "");

  // If it starts with +, assume it's already in E.164 format
  if (cleaned.startsWith("+")) {
    return cleaned;
  }

  // If it's 10 digits, assume US number and add +1
  if (cleaned.length === 10) {
    return `+1${cleaned}`;
  }

  // If it's 11 digits starting with 1, add +
  if (cleaned.length === 11 && cleaned.startsWith("1")) {
    return `+${cleaned}`;
  }

  return null;
}





















































