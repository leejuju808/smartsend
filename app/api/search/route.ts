import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";

export async function GET(req: Request) {
  const supabase = createRouteHandlerClient({ cookies });
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const q = url.searchParams.get("q")?.trim() ?? "";

  if (!q) {
    return NextResponse.json({ leads: [], campaigns: [], domains: [], events: [] });
  }

  // Get workspace_id from user's workspace_members (for multi-tenant support)
  const { data: membership } = await supabase
    .from("workspace_members")
    .select("workspace_id")
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle();

  const workspaceId = membership?.workspace_id;

  // LEADS - Full-text search with workspace_id or user_id filter
  let leadsQuery = supabase
    .from("leads")
    .select("id, first_name, last_name, email, company");

  if (workspaceId) {
    leadsQuery = leadsQuery.eq("workspace_id", workspaceId);
  } else {
    leadsQuery = leadsQuery.eq("user_id", user.id);
  }

  const { data: leads } = await leadsQuery
    .textSearch(
      "to_tsvector('simple', coalesce(first_name,'') || ' ' || coalesce(last_name,'') || ' ' || coalesce(email,'') || ' ' || coalesce(company,''))",
      q,
      { type: "plain", config: "simple" }
    )
    .limit(10);

  // CAMPAIGNS - Full-text search
  let campaignsQuery = supabase
    .from("campaigns")
    .select("id, name, status");

  if (workspaceId) {
    campaignsQuery = campaignsQuery.eq("workspace_id", workspaceId);
  } else {
    campaignsQuery = campaignsQuery.eq("user_id", user.id);
  }

  const { data: campaigns } = await campaignsQuery
    .textSearch("to_tsvector('simple', coalesce(name,''))", q, { type: "plain", config: "simple" })
    .limit(10);

  // DOMAINS / SENDERS - Filter by user_id or account_id
  let domainsQuery = supabase
    .from("sender_identities")
    .select("id, email_address, domain, email_from, from_email");

  // Check which column exists for user filtering
  const { data: senderSample } = await supabase
    .from("sender_identities")
    .select("user_id, account_id")
    .limit(1)
    .maybeSingle();

  if (senderSample?.user_id !== undefined) {
    domainsQuery = domainsQuery.eq("user_id", user.id);
  } else if (senderSample?.account_id !== undefined) {
    domainsQuery = domainsQuery.eq("account_id", user.id);
  }

  // Use ilike for sender_identities since textSearch might not work with multiple columns
  const { data: domains } = await domainsQuery
    .or(`email_address.ilike.%${q}%,email_from.ilike.%${q}%,from_email.ilike.%${q}%,domain.ilike.%${q}%`)
    .limit(10);

  // Normalize domains response
  const normalizedDomains = (domains || []).map((d: any) => ({
    id: d.id,
    email_address: d.email_address || d.email_from || d.from_email || "",
    domain: d.domain || "",
  }));

  // EVENTS - Search by subject
  let eventsQuery = supabase
    .from("email_events")
    .select("id, event_type, created_at, subject, lead_id");

  if (workspaceId) {
    // If email_events has workspace_id column
    eventsQuery = eventsQuery.eq("workspace_id", workspaceId);
  }

  const { data: events } = await eventsQuery
    .or(`subject.ilike.%${q}%`)
    .order("created_at", { ascending: false })
    .limit(10);

  return NextResponse.json({ 
    leads: leads || [], 
    campaigns: campaigns || [], 
    domains: normalizedDomains, 
    events: events || [] 
  });
}
