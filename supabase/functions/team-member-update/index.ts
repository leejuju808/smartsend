import "jsr:@supabase/functions@1.4.0/types";
import { createClient } from "jsr:@supabase/supabase-js";

const SB_URL = Deno.env.get("SUPABASE_URL")!;
const SRK = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  const sb = createClient(SB_URL, SRK);
  const { owner_user_id, member_user_id, role, active } = await req.json();

  const { data: camps, error: campError } = await sb
    .from("campaigns")
    .select("id")
    .eq("user_id", owner_user_id);

  if (campError) {
    return new Response(JSON.stringify({ ok: false, error: campError.message }), { status: 400 });
  }

  for (const c of camps || []) {
    if (role) {
      const { error } = await sb
        .from("campaign_members")
        .update({ role })
        .eq("campaign_id", c.id)
        .eq("user_id", member_user_id);

      if (error) {
        return new Response(JSON.stringify({ ok: false, error: error.message }), { status: 400 });
      }
    }

    if (typeof active === "boolean") {
      const { error } = await sb
        .from("campaign_members")
        .update({
          active,
          removed_at: active ? null : new Date().toISOString(),
        })
        .eq("campaign_id", c.id)
        .eq("user_id", member_user_id);

      if (error) {
        return new Response(JSON.stringify({ ok: false, error: error.message }), { status: 400 });
      }
    }
  }

  return new Response(JSON.stringify({ ok: true }), { status: 200 });
});











