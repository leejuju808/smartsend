// Block 66000 — SmartSend Insurance Claim Assistant v1
// Edge Function: Generate Claim Documentation Packet
// Creates a PDF packet with inspection photos, damage labels, missing line items, supplement explanation, measurements, and AI summary

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.48.0";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
  auth: { persistSession: false },
});

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
      },
    });
  }

  try {
    const { job_id, scope_verification_id, packet_type = "full" } = await req.json();

    if (!job_id || !scope_verification_id) {
      return new Response(
        JSON.stringify({ error: "job_id and scope_verification_id required" }),
        {
          status: 400,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
        }
      );
    }

    // 1. Fetch all data needed for packet
    const { data: verification, error: verificationError } = await supabase
      .from("scope_verification")
      .select("*, insurance_scopes(*), jobs(*)")
      .eq("id", scope_verification_id)
      .single();

    if (verificationError || !verification) {
      return new Response(
        JSON.stringify({ error: "Scope verification not found" }),
        {
          status: 404,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
        }
      );
    }

    // 2. Fetch job photos
    const { data: photos } = await supabase
      .from("job_photos")
      .select("*")
      .eq("job_id", job_id);

    // 3. Fetch measurement data
    const { data: measurements } = await supabase
      .from("roof_measurement_data")
      .select("*")
      .eq("job_id", job_id)
      .limit(1)
      .single();

    // 4. Build packet content (for MVP, we'll create a structured JSON that can be converted to PDF)
    // In production, you'd use a PDF generation library like pdfkit or puppeteer
    const packetData = {
      job_id,
      created_at: new Date().toISOString(),
      insurance_scope: {
        claim_number: verification.insurance_scopes?.claim_number,
        insurance_company: verification.insurance_scopes?.insurance_company,
        adjuster_name: verification.insurance_scopes?.adjuster_name,
        total_scope_value: verification.insurance_scopes?.total_scope_value,
      },
      verification_summary: {
        total_estimated_underpayment: verification.total_estimated_underpayment,
        missing_items_count: (verification.missing_items || []).length,
        incorrect_items_count: (verification.incorrect_items || []).length,
        code_violations_count: (verification.code_violations || []).length,
        ai_summary: verification.ai_summary,
      },
      missing_items: verification.missing_items || [],
      incorrect_items: verification.incorrect_items || [],
      code_violations: verification.code_violations || [],
      recommended_supplements: verification.recommended_supplements || [],
      photos: photos || [],
      measurements: measurements || null,
    };

    // 5. For MVP, we'll store the packet data as JSON
    // In production, you'd generate an actual PDF using a library
    const packetFileName = `claim-packet-${job_id}-${Date.now()}.json`;
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from("claim-packets")
      .upload(packetFileName, JSON.stringify(packetData, null, 2), {
        contentType: "application/json",
        upsert: false,
      });

    if (uploadError) {
      throw uploadError;
    }

    // 6. Create claim_packets record
    const { data: packet, error: packetError } = await supabase
      .from("claim_packets")
      .insert({
        job_id,
        workspace_id: verification.workspace_id,
        scope_verification_id,
        packet_url: packetFileName,
        packet_type,
        includes_photos: (photos?.length || 0) > 0,
        includes_measurements: !!measurements,
        includes_supplements: (verification.recommended_supplements || []).length > 0,
      })
      .select()
      .single();

    if (packetError) {
      throw packetError;
    }

    return new Response(
      JSON.stringify({
        success: true,
        packet_id: packet.id,
        packet_url: packetFileName,
        packet_data: packetData,
      }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      }
    );
  } catch (error: any) {
    console.error("Error generating packet:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Failed to generate packet" }),
      {
        status: 500,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      }
    );
  }
});




























