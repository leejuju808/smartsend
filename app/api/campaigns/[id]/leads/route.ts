import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createRouteHandlerClient({ cookies });
  const { searchParams } = new URL(req.url);

  // Get current user for account_id
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const status = searchParams.get("status"); // queued|sending|sent|failed|replied|all (legacy)
  const leadStatus = searchParams.get("lead_status"); // hot|warm|neutral|cold|not_interested|unsubscribed|new
  const pipelineStage = searchParams.get("pipeline_stage"); // new|contacted|estimate_scheduled|estimate_sent|follow_up|won|lost
  const search = searchParams.get("search"); // email/name search
  const start = searchParams.get("start"); // ISO date (inclusive)
  const end = searchParams.get("end"); // ISO date (exclusive)
  const page = Number(searchParams.get("page") ?? 1);
  const limit = Math.min(100, Number(searchParams.get("limit") ?? 25));

  // Get campaign to find account_id
  const { data: campaign } = await supabase
    .from("campaigns")
    .select("id, account_id, user_id, workspace_id")
    .eq("id", params.id)
    .single();

  if (!campaign) {
    return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
  }

  // Determine account_id (could be account_id, user_id, or workspace_id)
  const accountId = campaign.account_id || campaign.user_id || campaign.workspace_id || user.id;

  // Query lead_auto_follow_up_stats with joins to contacts
  let query = supabase
    .from("lead_auto_follow_up_stats")
    .select(
      `
      *,
      contact:contacts(
        id,
        email,
        first_name,
        last_name,
        company
      )
    `,
      { count: "exact" }
    )
    .eq("campaign_id", params.id)
    .eq("account_id", accountId);

  // Apply filters
  if (leadStatus) {
    const statuses = leadStatus.split(",").map(s => s.trim());
    if (statuses.length === 1) {
      query = query.eq("lead_status", statuses[0]);
    } else {
      query = query.in("lead_status", statuses);
    }
  }

  if (pipelineStage) {
    query = query.eq("pipeline_stage", pipelineStage);
  }

  if (start) query = query.gte("created_at", start);
  if (end) query = query.lt("created_at", end);

  if (search) {
    // Search in contacts table
    query = query.or(`contact.email.ilike.%${search}%,contact.first_name.ilike.%${search}%,contact.last_name.ilike.%${search}%,contact.company.ilike.%${search}%`);
  }

  const from = (page - 1) * limit;
  const to = from + limit - 1;

  query = query.order("updated_at", { ascending: false }).range(from, to);

  const { data, error, count } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Transform the nested structure to match the expected format
  const rows = (data ?? []).map((row: any) => {
    const contact = Array.isArray(row.contact) ? row.contact[0] : row.contact || {};
    
    return {
      contact_id: row.contact_id,
      email: contact.email || null,
      name: contact.first_name && contact.last_name 
        ? `${contact.first_name} ${contact.last_name}`.trim()
        : contact.first_name || contact.last_name || null,
      lead_status: row.lead_status || "new",
      pipeline_stage: row.pipeline_stage || "new",
      last_outbound_at: row.last_outbound_at || null,
      last_inbound_at: row.last_inbound_at || null,
      last_intent: row.last_intent || null,
      auto_follow_ups_sent: row.auto_follow_ups_sent || 0,
      last_auto_follow_up_at: row.last_auto_follow_up_at || null,
      lead_score: row.current_lead_score || 0,
    };
  });

  return NextResponse.json({
    rows,
    page,
    limit,
    total: count ?? 0,
    total_pages: Math.max(1, Math.ceil((count ?? 0) / limit)),
  });
}


