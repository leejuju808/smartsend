// supabase/functions/provider-events/index.ts
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);
const HMAC_SECRET = Deno.env.get("EVENTS_HMAC_SECRET") || "";

function hmacOk(raw: string, sentSig: string | null): boolean {
  if (!HMAC_SECRET) return true; // disabled
  if (!sentSig) return false;

  // Note: For Resend/Svix, proper verification requires the svix library
  // This is a simplified check; for production, use Svix SDK or implement
  // full Svix signature verification (svix-id, svix-timestamp, svix-signature)
  
  // For now, simple HMAC check for other providers
  // TODO: Implement proper Svix verification for Resend
  try {
    const encoder = new TextEncoder();
    const keyData = encoder.encode(HMAC_SECRET);
    const msgData = encoder.encode(raw);
    
    // Use Web Crypto API for HMAC
    const key = await crypto.subtle.importKey(
      "raw",
      keyData,
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );
    
    const signature = await crypto.subtle.sign("HMAC", key, msgData);
    const hexSig = Array.from(new Uint8Array(signature))
      .map(b => b.toString(16).padStart(2, "0"))
      .join("");
    
    // Basic comparison (for non-Svix providers)
    // For Svix, the signature format is different and requires parsing
    return hexSig === sentSig || sentSig.includes(hexSig) || sentSig.startsWith("sha256=" + hexSig);
  } catch {
    return false;
  }
}

Deno.serve(async (req) => {
  try {
    if (req.method !== "POST") {
      return new Response("Method Not Allowed", { status: 405 });
    }

    const raw = await req.text();
    const sig = req.headers.get("x-signature") || 
                req.headers.get("x-resend-signature") || 
                req.headers.get("svix-signature") ||
                null;
    
    if (!hmacOk(raw, sig)) {
      return new Response("Bad signature", { status: 401 });
    }

    const body = JSON.parse(raw);
    const provider = String(body.provider || "unknown");
    const events = Array.isArray(body.events) ? body.events : [body];

    for (const e of events) {
      const provider_message_id = e.message_id ?? 
                                   e.provider_message_id ?? 
                                   e.data?.id ?? 
                                   e.id;
      
      if (!provider_message_id) continue;

      // find log by provider_message_id
      const { data: log } = await supabase
        .from("send_logs")
        .select("id, campaign_id, lead_id")
        .eq("provider_message_id", provider_message_id)
        .maybeSingle();

      if (!log?.id) continue;

      const kind = String(e.type || e.kind || e.event || "").toLowerCase();
      const allowed = ["delivered", "open", "click", "bounce", "spam", "unsubscribe"];
      
      // Normalize event type
      let normalizedKind = kind;
      if (kind.includes("delivered")) normalizedKind = "delivered";
      else if (kind.includes("open")) normalizedKind = "open";
      else if (kind.includes("click")) normalizedKind = "click";
      else if (kind.includes("bounce")) normalizedKind = "bounce";
      else if (kind.includes("spam") || kind.includes("complaint")) normalizedKind = "spam";
      else if (kind.includes("unsubscribe")) normalizedKind = "unsubscribe";
      
      if (!allowed.includes(normalizedKind)) continue;

      // Upsert via event_key uniqueness (recreate created_at from payload if present)
      const created_at = e.timestamp 
        ? new Date(e.timestamp).toISOString() 
        : new Date().toISOString();

      const insert = {
        log_id: log.id,
        campaign_id: log.campaign_id,
        lead_id: log.lead_id,
        kind: normalizedKind,
        event: normalizedKind, // support both columns
        provider,
        provider_message_id,
        meta: e.meta ?? e.data ?? {},
        created_at
      };

      const { error: insErr } = await supabase
        .from("delivery_events")
        .insert(insert);

      // Ignore duplicates (unique constraint)
      if (insErr && !String(insErr.message).toLowerCase().includes("duplicate")) {
        console.error("insert delivery_events failed", insErr.message);
      }

      // Handle unsubscribe separately (already handled by trigger, but explicit for clarity)
      if (normalizedKind === "unsubscribe") {
        const { data: leadRow } = await supabase
          .from("leads")
          .select("email")
          .eq("id", log.lead_id)
          .maybeSingle();
        
        if (leadRow?.email) {
          await supabase.rpc("suppress_email", {
            p_email: leadRow.email.toLowerCase(),
            p_reason: "unsubscribe",
            p_meta: { via: "provider_webhook" }
          });
        }
      }
    }

    return new Response(JSON.stringify({ ok: true }), { 
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  } catch (err) {
    console.error(err);
    return new Response(
      JSON.stringify({ ok: false, error: String(err) }), 
      { 
        status: 500,
        headers: { "Content-Type": "application/json" }
      }
    );
  }
});

