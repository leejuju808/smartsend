// deno-lint-ignore-file no-explicit-any
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } }
);

Deno.serve(async (req) => {
  try {
    const { campaign_id, lead_id, step_no, to } = await req.json();
    if (!campaign_id || !lead_id || !step_no || !to) {
      return new Response(
        JSON.stringify({ error: "campaign_id, lead_id, step_no, to required" }), 
        { status: 400, headers: { "content-type":"application/json" } }
      );
    }

    // Render template using render-step function
    const renderUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/render-step`;
    const renderRes = await fetch(renderUrl, {
      method: "POST",
      headers: { 
        "content-type": "application/json", 
        "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}` 
      },
      body: JSON.stringify({ campaign_id, lead_id, step_no })
    });
    
    const { subject, body_html, ok: renderOk, error: renderError } = await renderRes.json();
    if (!renderOk) {
      return new Response(
        JSON.stringify({ ok: false, error: renderError || "render failed" }), 
        { status: 500, headers: { "content-type":"application/json" } }
      );
    }

    // TODO: Send via provider (Gmail/Outlook/SMTP)
    // For now, just log to test_sends table
    await supabase.from("test_sends").insert({
      campaign_id,
      lead_id,
      step_no,
      to_email: to,
      subject,
      body_html,
      sent_at: new Date().toISOString()
    });

    return new Response(
      JSON.stringify({ ok: true, subject, body_html }), 
      { headers: { "content-type": "application/json" } }
    );
  } catch (e) {
    return new Response(
      JSON.stringify({ ok: false, error: String(e) }), 
      { status: 500, headers: { "content-type":"application/json" } }
    );
  }
});

