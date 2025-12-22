// app/api/leads/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(req: Request) {
  const supabase = createClient();
  const url = new URL(req.url);
  const status = url.searchParams.get("status") || "all"; // 'all' | 'hot' | 'warm' | 'follow_up'
  const owner = url.searchParams.get("owner") || "all"; // 'all' | 'me' | user_id

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Find default workspace
  const { data: membership, error: memberError } = await supabase
    .from("workspace_members")
    .select("workspace_id")
    .eq("user_id", user.id)
    .eq("is_default", true)
    .single();

  let workspaceId: string | null = null;

  if (membership) {
    workspaceId = membership.workspace_id;
  } else {
    // Fallback: get first workspace if no default
    const { data: fallbackMembership } = await supabase
      .from("workspace_members")
      .select("workspace_id")
      .eq("user_id", user.id)
      .limit(1)
      .single();

    if (!fallbackMembership) {
      return NextResponse.json({ error: "No workspace" }, { status: 404 });
    }

    workspaceId = fallbackMembership.workspace_id;
  }

  // Get contacts that are hot/warm OR have recent intent (hot/warm/follow_up)
  // First: load recent inbound messages with intents for this workspace
  const { data: inbound, error: inboundError } = await supabase
    .from("email_messages")
    .select("contact_id, intent_label, created_at")
    .eq("workspace_id", workspaceId)
    .in("direction", ["inbound", "in"])
    .in("intent_label", ["hot_lead", "warm_lead", "follow_up"])
    .gte("created_at", new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()); // last 30 days

  if (inboundError) {
    return NextResponse.json(
      { error: inboundError.message },
      { status: 400 }
    );
  }

  // Build a map of contact -> latest intent + time
  const latestIntentMap = new Map<
    string,
    { intent_label: string; created_at: string }
  >();

  for (const row of inbound || []) {
    if (!row.contact_id) continue;
    const existing = latestIntentMap.get(row.contact_id);
    if (!existing || new Date(row.created_at) > new Date(existing.created_at)) {
      latestIntentMap.set(row.contact_id, {
        intent_label: row.intent_label,
        created_at: row.created_at,
      });
    }
  }

  const interestingContactIds = Array.from(latestIntentMap.keys());

  // Base contacts query
  let query = supabase
    .from("contacts")
    .select(
      `
      id,
      first_name,
      last_name,
      email,
      city,
      lead_status,
      est_job_value,
      owner_user_id,
      last_lead_event_at
    `
    )
    .eq("workspace_id", workspaceId);

  // Filter by status
  if (status === "hot") {
    query = query.eq("lead_status", "hot");
  } else if (status === "warm") {
    query = query.eq("lead_status", "warm");
  } else if (status === "follow_up") {
    // Use contacts that have latest intent follow_up
    if (interestingContactIds.length === 0) {
      return NextResponse.json({ leads: [] });
    }
    query = query.in("id", interestingContactIds);
  } else {
    // all = hot/warm + any recent intent
    const statusFilter = ["hot", "warm"];
    if (interestingContactIds.length > 0) {
      query = query.or(
        `lead_status.in.(${statusFilter
          .map((s) => `"${s}"`)
          .join(",")}),id.in.(${interestingContactIds
          .map((id) => `"${id}"`)
          .join(",")})`
      );
    } else {
      query = query.in("lead_status", statusFilter);
    }
  }

  // Filter by owner
  if (owner === "me") {
    query = query.eq("owner_user_id", user.id);
  } else if (owner !== "all") {
    query = query.eq("owner_user_id", owner);
  }

  // Execute
  const { data: contacts, error: contactsError } = await query;
  if (contactsError) {
    return NextResponse.json(
      { error: contactsError.message },
      { status: 400 }
    );
  }

  if (!contacts || contacts.length === 0) {
    return NextResponse.json({ leads: [] });
  }

  // Attach latest intent + last_reply_at + last_reply_snippet
  const contactIds = contacts.map((c) => c.id);

  const { data: latestReplies, error: lastErr } = await supabase
    .from("email_messages")
    .select("contact_id, body, body_text, created_at")
    .eq("workspace_id", workspaceId)
    .in("direction", ["inbound", "in"])
    .in("contact_id", contactIds)
    .order("created_at", { ascending: false });

  if (lastErr) {
    return NextResponse.json({ error: lastErr.message }, { status: 400 });
  }

  const replyMap = new Map<
    string,
    { created_at: string; body_plain: string | null }
  >();

  for (const msg of latestReplies || []) {
    if (!msg.contact_id) continue;
    if (!replyMap.has(msg.contact_id)) {
      // Use body_text if body is null (matching inbox route pattern)
      const bodyContent = (msg as any).body || (msg as any).body_text || null;
      replyMap.set(msg.contact_id, {
        created_at: msg.created_at,
        body_plain: bodyContent,
      });
    }
  }

  const leads = contacts.map((c) => {
    const latestIntent = latestIntentMap.get(c.id);
    const latestReply = replyMap.get(c.id);

    // compute urgency rank
    // Hot = 3, Warm = 2, Follow-up = 1
    const statusScore = c.lead_status === "hot" ? 3 : c.lead_status === "warm" ? 2 : 1;
    const urgencyScore =
      statusScore * 1000000000 +
      (latestReply
        ? new Date(latestReply.created_at).getTime()
        : latestIntent
        ? new Date(latestIntent.created_at).getTime()
        : 0);

    return {
      id: c.id,
      first_name: c.first_name,
      last_name: c.last_name,
      email: c.email,
      city: c.city,
      lead_status: c.lead_status,
      est_job_value: c.est_job_value,
      owner_user_id: c.owner_user_id,
      last_reply_at: latestReply?.created_at || null,
      last_reply_snippet: latestReply?.body_plain || null,
      latest_intent_label: latestIntent?.intent_label || null,
      latest_intent_at: latestIntent?.created_at || null,
      urgency_score: urgencyScore,
    };
  });

  // Sort by urgency desc
  leads.sort((a, b) => b.urgency_score - a.urgency_score);

  return NextResponse.json({ leads });
}
