// app/api/replies/list/route.ts

import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@/lib/supabase/types";

export async function POST(req: NextRequest) {
  const supabase = createRouteHandlerClient<Database>({ cookies });

  // Get user and account
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  // Get account_id
  const { data: membership } = await supabase
    .from("account_members")
    .select("account_id")
    .eq("user_id", user.id)
    .or("is_active.is.null,is_active.eq.true")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!membership?.account_id) {
    return NextResponse.json({ ok: false, error: "No active account" }, { status: 404 });
  }

  const accountId = membership.account_id;

  // Set account context for RLS
  await supabase.rpc("set_account", { p_account_id: accountId });

  const body = await req.json().catch(() => ({}));

  const page = Number(body.page ?? 1);
  const pageSize = Number(body.pageSize ?? 25);
  const campaignId = body.campaignId ?? null;
  const status = body.status ?? null; // unread, handled, any

  const offset = (page - 1) * pageSize;

  // If filtering by campaign, first get matching send_log_ids
  let sendLogIds: string[] | null = null;
  if (campaignId) {
    const { data: logs, error: logsError } = await supabase
      .from("send_logs")
      .select("id")
      .eq("campaign_id", campaignId)
      .eq("account_id", accountId);

    if (logsError) {
      return NextResponse.json(
        { ok: false, error: logsError.message },
        { status: 500 }
      );
    }
    sendLogIds = logs?.map((l) => l.id) ?? [];
    if (sendLogIds.length === 0) {
      return NextResponse.json({
        ok: true,
        page,
        pageSize,
        total: 0,
        replies: [],
      });
    }
  }

  let query = supabase
    .from("email_replies")
    .select(
      `
      id,
      created_at,
      from_email,
      subject,
      raw_text,
      handled,
      qualified,
      send_logs (
        campaign_id,
        campaigns ( name ),
        lead_id,
        leads ( first_name, last_name, email )
      )
    `,
      { count: "exact" }
    )
    .eq("account_id", accountId)
    .order("created_at", { ascending: false });

  if (campaignId && sendLogIds && sendLogIds.length > 0) {
    query = query.in("send_log_id", sendLogIds);
  }

  if (status === "unread") {
    query = query.eq("handled", false);
  } else if (status === "handled") {
    query = query.eq("handled", true);
  }

  const { data, error, count } = await query.range(offset, offset + pageSize - 1);

  if (error) {
    return NextResponse.json(
      { ok: false, error: error.message },
      { status: 500 }
    );
  }

  // Transform the data to match the expected format
  const replies = (data ?? []).map((r: any) => {
    const sendLog = Array.isArray(r.send_logs) ? r.send_logs[0] : r.send_logs;
    const lead = sendLog?.leads;
    const campaign = sendLog?.campaigns;

    return {
      id: r.id,
      created_at: r.created_at,
      snippet: r.raw_text || "",
      handled: r.handled ?? false,
      qualified: r.qualified,
      leads: {
        first_name: lead?.first_name || "",
        last_name: lead?.last_name || "",
        email: lead?.email || r.from_email || "",
      },
      campaigns: {
        name: campaign?.name || "",
      },
    };
  });

  return NextResponse.json({
    ok: true,
    page,
    pageSize,
    total: count ?? 0,
    replies,
  });
}
