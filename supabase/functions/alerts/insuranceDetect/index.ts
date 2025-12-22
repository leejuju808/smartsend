import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } }
);

interface InsuranceAlertPayload {
  workspace_id: string;
  contact_id: string;
  message_id?: string;
  insurance_type?: string; // 'claim', 'adjuster', 'deductible', 'coverage'
  details?: string;
  metadata?: Record<string, any>;
}

Deno.serve(async (req) => {
  try {
    const payload: InsuranceAlertPayload = await req.json();

    if (!payload.workspace_id || !payload.contact_id) {
      return new Response(
        JSON.stringify({ error: "Missing required fields" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Get contact info
    const { data: contact } = await supabase
      .from("contacts")
      .select("email, first_name, last_name")
      .eq("id", payload.contact_id)
      .single();

    if (!contact) {
      return new Response(
        JSON.stringify({ error: "Contact not found" }),
        { status: 404 }
      );
    }

    const contactName = `${contact.first_name || ""} ${contact.last_name || ""}`.trim() || contact.email.split("@")[0];

    // Create alert
    const insuranceType = payload.insurance_type || "claim";
    const title = `📄 Insurance ${insuranceType === "adjuster" ? "Adjuster" : "Claim"} Detected — ${contactName}`;
    const message = payload.details || 
      `${insuranceType === "adjuster" ? "Adjuster scheduled" : "Insurance claim language detected"}. Move to Insurance Pipeline?`;

    // Get workspace members
    const { data: members } = await supabase
      .from("workspace_members")
      .select("user_id")
      .eq("workspace_id", payload.workspace_id);

    if (!members || members.length === 0) {
      return new Response(
        JSON.stringify({ error: "No workspace members found" }),
        { status: 404 }
      );
    }

    // Create alerts
    const alertPromises = members.map(member =>
      supabase.rpc("create_alert", {
        p_workspace_id: payload.workspace_id,
        p_user_id: member.user_id,
        p_type: "insurance_claim",
        p_title: title,
        p_message: message,
        p_contact_id: payload.contact_id,
        p_metadata: {
          insurance_type: insuranceType,
          details: payload.details,
          message_id: payload.message_id,
          ...payload.metadata,
        },
        p_source: "insurance_detection",
      })
    );

    await Promise.all(alertPromises);

    return new Response(
      JSON.stringify({ ok: true, alerts_created: members.length }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error in alerts/insuranceDetect:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});





















































