import "jsr:@supabase/functions-js/edge-runtime.d.ts";
// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

async function unwrap<T>(promise: Promise<{ data: T | null; error: any }>) {
  const { data, error } = await promise;
  if (error) throw new Error(error.message ?? "Supabase request failed");
  return data!;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceKey) {
    return new Response(JSON.stringify({ error: "missing service configuration" }), { status: 500 });
  }

  const client = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
  const { thread_id: threadId } = await req.json();

  if (!threadId) {
    return new Response(JSON.stringify({ error: "thread_id required" }), { status: 400 });
  }

  const thread = await unwrap(
    client.from("threads")
      .select("id, owner_id, campaign_id")
      .eq("id", threadId)
      .maybeSingle()
  );

  if (!thread) {
    return new Response(JSON.stringify({ error: "thread not found" }), { status: 404 });
  }

  const vThread = await unwrap(
    client.from("v_thread_account")
      .select("account_id, campaign_id")
      .eq("thread_id", threadId)
      .single()
  );
  const accountId = vThread.account_id;

  const message = await unwrap(
    client.from("messages")
      .select("id, subject, from_email")
      .eq("thread_id", threadId)
      .eq("direction", "inbound")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()
  );

  const domain = (message?.from_email ?? "").split("@")[1]?.toLowerCase() ?? "";

  const { data: rules } = await client
    .from("routing_rules")
    .select("*")
    .eq("account_id", accountId)
    .eq("active", true)
    .order("priority", { ascending: true });

  let chosenUser: string | null = null;
  let chosenPool: string | null = null;
  let reason: "rule" | "round_robin" | "fallback_ooo" = "round_robin";

  for (const rule of rules ?? []) {
    const value = rule.match_value?.toLowerCase?.() ?? "";
    if (rule.match_type === "domain" && domain === value) {
      if (rule.action === "assign_user" && rule.user_id) { chosenUser = rule.user_id; reason = "rule"; break; }
      if (rule.action === "assign_pool" && rule.pool_id) { chosenPool = rule.pool_id; reason = "rule"; break; }
    }
    if (rule.match_type === "email" && (message?.from_email ?? "").toLowerCase() === value) {
      if (rule.action === "assign_user" && rule.user_id) { chosenUser = rule.user_id; reason = "rule"; break; }
      if (rule.action === "assign_pool" && rule.pool_id) { chosenPool = rule.pool_id; reason = "rule"; break; }
    }
    if (rule.match_type === "subject_regex" && rule.match_value) {
      try {
        const re = new RegExp(rule.match_value, "i");
        if (re.test(message?.subject ?? "")) {
          if (rule.action === "assign_user" && rule.user_id) { chosenUser = rule.user_id; reason = "rule"; break; }
          if (rule.action === "assign_pool" && rule.pool_id) { chosenPool = rule.pool_id; reason = "rule"; break; }
        }
      } catch {
        // ignore invalid regex patterns
      }
    }
    if (rule.match_type === "campaign" && rule.match_value === String(thread.campaign_id ?? "")) {
      if (rule.action === "assign_user" && rule.user_id) { chosenUser = rule.user_id; reason = "rule"; break; }
      if (rule.action === "assign_pool" && rule.pool_id) { chosenPool = rule.pool_id; reason = "rule"; break; }
    }
  }

  if (!chosenUser) {
    if (!chosenPool) {
      let pool = await unwrap(
        client.from("owner_pools")
          .select("id")
          .eq("account_id", accountId)
          .eq("name", "Inbox Team")
          .maybeSingle()
      );

      if (!pool) {
        pool = await unwrap(
          client.from("owner_pools")
            .insert({ account_id: accountId, name: "Inbox Team" })
            .select("id")
            .single()
        );
      }

      chosenPool = pool.id;
    }

    const { data: rr } = await client.rpc("pick_owner_round_robin", { p_pool: chosenPool });
    if (rr) {
      chosenUser = rr as string;
    }
  }

  if (!chosenUser) {
    return new Response(JSON.stringify({ error: "no eligible owner in pool" }), { status: 409 });
  }

  const isOOO = async (userId: string) => {
    const { data } = await client.rpc("is_user_ooo", { p_user: userId });
    return Boolean(data);
  };

  if (await isOOO(chosenUser)) {
    const { data: members } = await client.from("owner_pool_members")
      .select("user_id, assigned_count, last_assigned_at, weight")
      .eq("pool_id", chosenPool!)
      .eq("is_active", true)
      .gt("weight", 0);

    const candidates = (members ?? []).sort((a: any, b: any) => {
      const weightA = Math.max(a.weight ?? 1, 1);
      const weightB = Math.max(b.weight ?? 1, 1);
      const score = (a.assigned_count ?? 0) / weightA - (b.assigned_count ?? 0) / weightB;
      if (score !== 0) return score;
      const timeA = a.last_assigned_at ? new Date(a.last_assigned_at).getTime() : 0;
      const timeB = b.last_assigned_at ? new Date(b.last_assigned_at).getTime() : 0;
      if (timeA !== timeB) return timeA - timeB;
      return String(a.user_id).localeCompare(String(b.user_id));
    });

    for (const member of candidates) {
      if (String(member.user_id) === String(chosenUser)) continue;
      if (!(await isOOO(member.user_id))) {
        chosenUser = member.user_id;
        reason = "fallback_ooo";
        break;
      }
    }
  }

  await client.from("threads").update({ owner_id: chosenUser }).eq("id", threadId);
  await client.from("thread_assignments").insert({
    thread_id: threadId,
    assigned_user_id: chosenUser,
    reason,
    meta: {
      pool_id: chosenPool,
      rule_reason: reason === "rule",
      domain,
      subject: message?.subject ?? null
    }
  });

  if (chosenPool) {
    await client.rpc("bump_member_assignment", { p_pool: chosenPool, p_user: chosenUser });
  }

  await client.rpc("log_activity", {
    p_account: accountId,
    p_campaign: thread.campaign_id,
    p_actor: null,
    p_actor_role: null,
    p_action: "update",
    p_entity_type: "thread",
    p_entity_id: threadId,
    p_entity_name: null,
    p_details: { owner_id: chosenUser, reason }
  });

  return new Response(JSON.stringify({ ok: true, owner_id: chosenUser, reason }), { status: 200 });
});


