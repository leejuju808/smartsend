// @ts-nocheck
// deno-lint-ignore-file no-explicit-any
import "jsr:@supabase/functions@1.4.0/types";
import { createClient } from "jsr:@supabase/supabase-js@2.45.4";

const SB_URL = Deno.env.get("SUPABASE_URL")!;
const SB_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

type Payload = {
  user_id?: string;
  lead_id?: string;
  email?: string;
  reason?: string;
};

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  const sb = createClient(SB_URL, SB_KEY, { auth: { persistSession: false } });

  try {
    const body = (await req.json()) as Payload;

    // Resolve lead if needed
    let lead_id = body.lead_id || undefined;
    if (!lead_id && body.email) {
      const { data: lead, error: leadError } = await sb
        .from("leads")
        .select("id")
        .eq("email", body.email)
        .maybeSingle();

      if (leadError) throw leadError;
      lead_id = lead?.id ?? undefined;
    }

    if (!lead_id) {
      throw new Error("lead_id or email required");
    }

    // Resolve tenant owner
    let user_id = body.user_id || undefined;
    if (!user_id) {
      const { data: last, error: lastError } = await sb
        .from("send_logs")
        .select("campaign_id")
        .eq("lead_id", lead_id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (lastError) throw lastError;
      if (!last?.campaign_id) {
        throw new Error("cannot resolve tenant user for this lead");
      }

      const { data: camp, error: campError } = await sb
        .from("campaigns")
        .select("user_id")
        .eq("id", last.campaign_id)
        .maybeSingle();

      if (campError) throw campError;
      user_id = camp?.user_id ?? undefined;
    }

    if (!user_id) {
      throw new Error("user_id resolution failed");
    }

    const { error } = await sb.rpc("unsubscribe_lead", {
      p_user: user_id,
      p_lead: lead_id,
      p_reason: body.reason ?? "unsubscribe",
    });

    if (error) throw error;

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (e: any) {
    const message = e?.message ?? String(e);
    return new Response(JSON.stringify({ ok: false, error: message }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }
});


