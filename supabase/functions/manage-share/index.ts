// deno-lint-ignore-file no-explicit-any
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const sb = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, // service key for owner enforcement checks
  { auth: { persistSession: false } }
);

async function assertOwner(campaign_id: string, actor: string) {
  const { data } = await sb.from("campaigns").select("owner_id, user_id").eq("id", campaign_id).maybeSingle();
  if (!data) throw new Error("campaign_not_found");
  const ownerId = data.owner_id || data.user_id;
  if (ownerId !== actor) throw new Error("not_owner");
}

async function log(action: string, actor: string, campaign_id: string, entity: string, entity_id: string, meta: any = {}) {
  await sb.from("audit_logs").insert({
    actor, action, campaign_id, entity, entity_id, meta
  });
}

Deno.serve(async (req) => {
  try {
    const auth = req.headers.get("x-actor") || ""; // pass client user id via header (supabase auth.uid on client)
    const { op, campaign_id, user_id, role } = await req.json();

    if (!campaign_id) return new Response(JSON.stringify({ error: "campaign_id required" }), { status: 400 });

    await assertOwner(campaign_id, auth);

    if (op === "add") {
      if (!user_id || !role) throw new Error("user_id and role required");
      
      // Check seat limits before adding
      const chk = await sb.rpc("can_add_collaborator", { p_campaign: campaign_id });
      const { ok, seats_used, seat_limit } = (chk.data ?? {}) as any;
      if (!ok) {
        return new Response(
          JSON.stringify({ 
            ok: false, 
            error: "seat_limit_reached", 
            seats_used, 
            seat_limit 
          }), 
          { status: 400, headers: { "content-type":"application/json" } }
        );
      }
      
      const { error } = await sb.from("campaign_shares").upsert({ campaign_id, user_id, role });
      if (error) throw error;
      await log("share.add", auth, campaign_id, "share", `${campaign_id}:${user_id}`, { role });
      return new Response(JSON.stringify({ ok: true }), { headers: { "content-type":"application/json" } });
    }

    if (op === "update") {
      if (!user_id || !role) throw new Error("user_id and role required");
      const { error } = await sb.from("campaign_shares").update({ role }).eq("campaign_id", campaign_id).eq("user_id", user_id);
      if (error) throw error;
      await log("share.update", auth, campaign_id, "share", `${campaign_id}:${user_id}`, { role });
      return new Response(JSON.stringify({ ok: true }), { headers: { "content-type":"application/json" } });
    }

    if (op === "remove") {
      if (!user_id) throw new Error("user_id required");
      const { error } = await sb.from("campaign_shares").delete().eq("campaign_id", campaign_id).eq("user_id", user_id);
      if (error) throw error;
      await log("share.remove", auth, campaign_id, "share", `${campaign_id}:${user_id}`);
      return new Response(JSON.stringify({ ok: true }), { headers: { "content-type":"application/json" } });
    }

    if (op === "list") {
      const { data, error } = await sb.from("campaign_shares").select("user_id, role").eq("campaign_id", campaign_id);
      if (error) throw error;
      return new Response(JSON.stringify({ ok: true, shares: data }), { headers: { "content-type":"application/json" } });
    }

    return new Response(JSON.stringify({ error: "unknown op" }), { status: 400 });
  } catch (e) {
    return new Response(JSON.stringify({ ok:false, error: String(e) }), { status: 500, headers: { "content-type":"application/json" } });
  }
});

