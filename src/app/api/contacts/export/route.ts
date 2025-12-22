import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";

/**
 * GET /api/contacts/export
 * Exports contacts as CSV with optional filters
 * 
 * Query parameters:
 * - status: Filter by lead status (New, Attempting, Warm, Hot, Customer, Not Interested)
 * - intent: Filter by intent (hot, warm, follow_up, not_interested, unclassified)
 * - tags: Comma-separated list of tags to filter by
 * - campaignId: Filter contacts in a specific campaign
 * - activity: Filter by activity (replied, not-replied, opened)
 * - dateRange: Filter by created date (e.g., "7d" for last 7 days)
 * - format: csv (default)
 */
export async function GET(req: NextRequest) {
  const supabase = createRouteHandlerClient({ cookies });
  const { data: u } = await supabase.auth.getUser();
  if (!u?.user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  // Get user's workspace
  const { data: profile } = await supabase
    .from("profiles")
    .select("workspace_id")
    .eq("id", u.user.id)
    .single();

  const workspaceId = profile?.workspace_id;
  if (!workspaceId) {
    return NextResponse.json({ ok: false, error: "No workspace found" }, { status: 400 });
  }

  const searchParams = new URL(req.url).searchParams;
  const status = searchParams.get("status");
  const intent = searchParams.get("intent");
  const tagsParam = searchParams.get("tags");
  const campaignId = searchParams.get("campaignId");
  const activity = searchParams.get("activity");
  const dateRange = searchParams.get("dateRange");

  // Build the query
  // We'll use a raw SQL query to get all the joined data efficiently
  let query = `
    SELECT 
      c.id as contact_id,
      c.first_name,
      c.last_name,
      COALESCE(c.first_name || ' ' || c.last_name, c.name, '') as full_name,
      c.email,
      c.phone,
      c.address,
      c.city,
      c.state,
      c.zip,
      COALESCE(
        CASE 
          WHEN c.tags::text = '[]' OR c.tags IS NULL THEN ''
          WHEN jsonb_typeof(c.tags) = 'array' THEN array_to_string(ARRAY(SELECT jsonb_array_elements_text(c.tags)), ';')
          ELSE ''
        END,
        ''
      ) as tags,
      COALESCE(c.status, 'New') as lead_status,
      COALESCE(rt.latest_intent, 'unclassified') as latest_intent,
      COALESCE(rt.last_activity_at::text, '') as last_activity,
      COUNT(DISTINCT cc.campaign_id) as campaign_count,
      COALESCE(
        string_agg(DISTINCT c2.name, ';' ORDER BY c2.name),
        ''
      ) as campaign_list,
      COALESCE(reply_counts.reply_count, 0) as reply_count,
      c.created_at::text as created_at
    FROM contacts c
    LEFT JOIN reply_threads rt ON rt.contact_id = c.id AND rt.workspace_id = c.workspace_id
    LEFT JOIN campaign_contacts cc ON cc.contact_id = c.id
    LEFT JOIN campaigns c2 ON c2.id = cc.campaign_id AND c2.workspace_id = c.workspace_id
    LEFT JOIN (
      SELECT 
        contact_id,
        COUNT(*) as reply_count
      FROM messages
      WHERE direction = 'inbound'
      GROUP BY contact_id
    ) reply_counts ON reply_counts.contact_id = c.id
    WHERE c.workspace_id = $1
  `;

  const params: any[] = [workspaceId];
  let paramIndex = 2;

  // Apply filters
  if (status) {
    query += ` AND c.status = $${paramIndex}`;
    params.push(status);
    paramIndex++;
  }

  if (intent) {
    query += ` AND rt.latest_intent = $${paramIndex}`;
    params.push(intent);
    paramIndex++;
  }

  if (tagsParam) {
    const tags = tagsParam.split(",").map(t => t.trim()).filter(Boolean);
    if (tags.length > 0) {
      query += ` AND EXISTS (
        SELECT 1 FROM jsonb_array_elements_text(c.tags) tag
        WHERE tag = ANY($${paramIndex}::text[])
      )`;
      params.push(tags);
      paramIndex++;
    }
  }

  if (campaignId) {
    query += ` AND EXISTS (
      SELECT 1 FROM campaign_contacts cc2
      WHERE cc2.contact_id = c.id AND cc2.campaign_id = $${paramIndex}
    )`;
    params.push(campaignId);
    paramIndex++;
  }

  if (activity === "replied") {
    query += ` AND EXISTS (
      SELECT 1 FROM messages m
      WHERE m.contact_id = c.id AND m.direction = 'inbound'
    )`;
  } else if (activity === "not-replied") {
    query += ` AND NOT EXISTS (
      SELECT 1 FROM messages m
      WHERE m.contact_id = c.id AND m.direction = 'inbound'
    )`;
  }

  if (dateRange) {
    // Parse dateRange (e.g., "7d", "30d")
    const match = dateRange.match(/(\d+)d/);
    if (match) {
      const days = parseInt(match[1]);
      query += ` AND c.created_at >= NOW() - INTERVAL '${days} days'`;
    }
  }

  query += ` GROUP BY c.id, rt.latest_intent, rt.last_activity_at, reply_counts.reply_count
    ORDER BY c.created_at DESC`;

  try {
    // Execute the query
    const { data, error } = await supabase.rpc("exec_sql", {
      query_text: query,
      params_array: params,
    });

    if (error) {
      // Fallback: try direct query if RPC doesn't exist
      // We'll use a simpler approach with Supabase client
      return await exportWithClient(supabase, workspaceId, {
        status,
        intent,
        tags: tagsParam,
        campaignId,
        activity,
        dateRange,
      });
    }

    // Generate CSV
    const csv = generateCSV(data || []);

    // Return CSV file
    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": `attachment; filename="contacts-export-${new Date().toISOString().split("T")[0]}.csv"`,
      },
    });
  } catch (error: any) {
    console.error("Export error:", error);
    // Fallback to client-based export
    return await exportWithClient(supabase, workspaceId, {
      status,
      intent,
      tags: tagsParam,
      campaignId,
      activity,
      dateRange,
    });
  }
}

/**
 * Fallback export using Supabase client (more reliable)
 */
async function exportWithClient(
  supabase: ReturnType<typeof createRouteHandlerClient>,
  workspaceId: string,
  filters: {
    status?: string | null;
    intent?: string | null;
    tags?: string | null;
    campaignId?: string | null;
    activity?: string | null;
    dateRange?: string | null;
  }
) {
  // Build base query
  let query = supabase
    .from("contacts")
    .select(`
      id,
      first_name,
      last_name,
      name,
      email,
      phone,
      address,
      city,
      state,
      zip,
      tags,
      status,
      created_at
    `)
    .eq("workspace_id", workspaceId);

  // Apply filters
  if (filters.status) {
    query = query.eq("status", filters.status);
  }

  if (filters.dateRange) {
    const match = filters.dateRange.match(/(\d+)d/);
    if (match) {
      const days = parseInt(match[1]);
      const date = new Date();
      date.setDate(date.getDate() - days);
      query = query.gte("created_at", date.toISOString());
    }
  }

  const { data: contacts, error } = await query.order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  if (!contacts || contacts.length === 0) {
    return NextResponse.json({ ok: false, error: "No contacts found" }, { status: 404 });
  }

  // Get additional data for each contact
  const contactIds = contacts.map((c) => c.id);

  // Get reply threads for intents
  const { data: replyThreads } = await supabase
    .from("reply_threads")
    .select("contact_id, latest_intent, last_activity_at")
    .in("contact_id", contactIds)
    .eq("workspace_id", workspaceId)
    .not("contact_id", "is", null);

  const intentMap = new Map(
    (replyThreads || []).map((rt) => [rt.contact_id, rt])
  );

  // Get campaign associations
  // First get campaign_contacts, then get campaign names
  const { data: campaignContacts } = await supabase
    .from("campaign_contacts")
    .select("contact_id, campaign_id")
    .in("contact_id", contactIds);

  const campaignIds = [...new Set((campaignContacts || []).map((cc: any) => cc.campaign_id).filter(Boolean))];
  
  let campaignNamesMap = new Map<string, string>();
  if (campaignIds.length > 0) {
    const { data: campaigns } = await supabase
      .from("campaigns")
      .select("id, name")
      .in("id", campaignIds);
    
    (campaigns || []).forEach((c: any) => {
      campaignNamesMap.set(c.id, c.name);
    });
  }

  const campaignMap = new Map<string, { count: number; names: string[] }>();
  (campaignContacts || []).forEach((cc: any) => {
    if (!campaignMap.has(cc.contact_id)) {
      campaignMap.set(cc.contact_id, { count: 0, names: [] });
    }
    const entry = campaignMap.get(cc.contact_id)!;
    entry.count++;
    const campaignName = campaignNamesMap.get(cc.campaign_id);
    if (campaignName && !entry.names.includes(campaignName)) {
      entry.names.push(campaignName);
    }
  });

  // Get reply counts - try by contact_id first, then by email
  const { data: messages } = await supabase
    .from("messages")
    .select("contact_id, from_email, to_email")
    .eq("direction", "inbound");

  const replyCountMap = new Map<string, number>();
  const emailToContactId = new Map<string, string>();
  contacts.forEach((c) => {
    if (c.email) {
      emailToContactId.set(c.email.toLowerCase(), c.id);
    }
  });

  (messages || []).forEach((m: any) => {
    // Try contact_id first
    if (m.contact_id && contactIds.includes(m.contact_id)) {
      replyCountMap.set(m.contact_id, (replyCountMap.get(m.contact_id) || 0) + 1);
    } else if (m.from_email) {
      // Fallback to email matching
      const contactId = emailToContactId.get(m.from_email.toLowerCase());
      if (contactId) {
        replyCountMap.set(contactId, (replyCountMap.get(contactId) || 0) + 1);
      }
    }
  });

  // Apply additional filters
  let filteredContacts = contacts;

  if (filters.intent) {
    filteredContacts = filteredContacts.filter((c) => {
      const thread = intentMap.get(c.id);
      return thread?.latest_intent === filters.intent;
    });
  }

  if (filters.tags) {
    const tags = filters.tags.split(",").map((t) => t.trim()).filter(Boolean);
    filteredContacts = filteredContacts.filter((c) => {
      const contactTags = Array.isArray(c.tags) ? c.tags : [];
      return tags.some((tag) => contactTags.includes(tag));
    });
  }

  if (filters.campaignId) {
    const campaignContactIds = new Set(
      (campaignContacts || [])
        .filter((cc: any) => cc.campaign_id === filters.campaignId)
        .map((cc: any) => cc.contact_id)
    );
    filteredContacts = filteredContacts.filter((c) => campaignContactIds.has(c.id));
  }

  if (filters.activity === "replied") {
    filteredContacts = filteredContacts.filter((c) => replyCountMap.has(c.id));
  } else if (filters.activity === "not-replied") {
    filteredContacts = filteredContacts.filter((c) => !replyCountMap.has(c.id));
  }

  // Build CSV rows
  const rows = filteredContacts.map((c) => {
    const thread = intentMap.get(c.id);
    const campaigns = campaignMap.get(c.id) || { count: 0, names: [] };
    const replyCount = replyCountMap.get(c.id) || 0;

    const tagsArray = Array.isArray(c.tags) ? c.tags : [];
    const fullName = [c.first_name, c.last_name].filter(Boolean).join(" ") || c.name || "";

    return {
      contact_id: c.id,
      first_name: c.first_name || "",
      last_name: c.last_name || "",
      full_name: fullName,
      email: c.email || "",
      phone: c.phone || "",
      address: c.address || "",
      city: c.city || "",
      state: c.state || "",
      zip: c.zip || "",
      tags: tagsArray.join(";"),
      lead_status: c.status || "New",
      latest_intent: thread?.latest_intent || "unclassified",
      last_activity: thread?.last_activity_at || "",
      campaign_count: campaigns.count.toString(),
      campaign_list: campaigns.names.join(";"),
      reply_count: replyCount.toString(),
      created_at: c.created_at || "",
    };
  });

  const csv = generateCSV(rows);

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": `attachment; filename="contacts-export-${new Date().toISOString().split("T")[0]}.csv"`,
    },
  });
}

/**
 * Generate CSV from array of objects
 */
function generateCSV(data: any[]): string {
  if (data.length === 0) {
    return "contact_id,first_name,last_name,full_name,email,phone,address,city,state,zip,tags,lead_status,latest_intent,last_activity,campaign_count,campaign_list,reply_count,created_at\n";
  }

  const headers = [
    "contact_id",
    "first_name",
    "last_name",
    "full_name",
    "email",
    "phone",
    "address",
    "city",
    "state",
    "zip",
    "tags",
    "lead_status",
    "latest_intent",
    "last_activity",
    "campaign_count",
    "campaign_list",
    "reply_count",
    "created_at",
  ];

  const escapeCSV = (value: any): string => {
    if (value === null || value === undefined) return "";
    const str = String(value);
    if (str.includes(",") || str.includes('"') || str.includes("\n")) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const rows = data.map((row) =>
    headers.map((header) => escapeCSV(row[header] || "")).join(",")
  );

  return [headers.join(","), ...rows].join("\n");
}

