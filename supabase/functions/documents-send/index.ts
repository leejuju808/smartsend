// Block 22830 — SmartSend Roofing Document Delivery & E-Sign v1
// Edge Function: /documents/send-to-homeowner
// 
// This function:
// - Inserts DB entry for the document
// - Updates homeowner portal feed (optional)
// - Creates a timeline event
// - Returns document info with signing link

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.48.0";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
  auth: { persistSession: false },
});

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const {
      workspace_id,
      job_id,
      document_type,
      storage_path,
      signer_name,
      signer_email,
    } = await req.json();

    if (!workspace_id || !job_id || !document_type || !storage_path) {
      return new Response(
        JSON.stringify({ error: "Missing required fields" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // 1️⃣ Insert document record
    const { data: doc, error: docError } = await supabase
      .from("job_signable_documents")
      .insert({
        workspace_id,
        job_id,
        document_type,
        storage_path,
        signer_name: signer_name || null,
        signer_email: signer_email || null,
        status: "sent",
      })
      .select()
      .single();

    if (docError) {
      console.error("Error inserting document:", docError);
      throw docError;
    }

    // 2️⃣ Insert timeline event (if job_timeline table exists)
    try {
      await supabase.from("job_timeline").insert({
        job_id,
        event_type: "document_sent",
        description: `${document_type} sent to ${signer_email || "homeowner"}`,
        metadata: {
          document_id: doc.id,
          document_type,
          signer_email,
        },
      });
    } catch (timelineError) {
      // Timeline insert is optional, don't fail if table doesn't exist
      console.warn("Could not insert timeline event:", timelineError);
    }

    // 3️⃣ Generate signing link (for homeowner portal)
    // Format: /homeowner/[token]/documents/[documentId]
    // We'll need to get or create a homeowner portal token
    let signingUrl = null;
    try {
      const { data: portal } = await supabase
        .from("homeowner_portals")
        .select("portal_token")
        .eq("job_id", job_id)
        .eq("is_enabled", true)
        .single();

      if (portal?.portal_token) {
        signingUrl = `/homeowner/${portal.portal_token}/documents/${doc.id}`;
      }
    } catch (portalError) {
      // Portal lookup is optional
      console.warn("Could not generate signing URL:", portalError);
    }

    return new Response(
      JSON.stringify({
        ok: true,
        document: {
          ...doc,
          signing_url: signingUrl,
        },
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (err: any) {
    console.error("Error in documents-send:", err);
    return new Response(
      JSON.stringify({ error: err.message || "Internal server error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});







































