import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { assertViewer } from "@/lib/acl";

export async function GET(req: NextRequest, { params }: { params: { campaignId: string } }) {
  try {
    await assertViewer(params.campaignId);
  } catch {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const supabase = createRouteHandlerClient({ cookies });
  const url = new URL(req.url);
  const q = (url.searchParams.get("q") || "").trim();
  const needs = url.searchParams.get("needs") ?? "any"; // any | true | false
  const snoozed = url.searchParams.get("snoozed") ?? "hide"; // hide | show | only
  const assigned = url.searchParams.get("assigned") ?? "any"; // any | me | none
  const sort = url.searchParams.get("sort") ?? "recent"; // recent | oldest
  const nowIso = new Date().toISOString();

  let me: string | null = null;
  if (assigned === "me") {
    const { data } = await supabase.auth.getUser();
    me = data.user?.id ?? null;
    if (!me) {
      return NextResponse.json({ items: [] });
    }
  }

  let query = supabase
    .from("v_inbox_threads_enriched")
    .select(
      "id,campaign_id,lead_id,lead_name,lead_company,lead_email,last_inbound_at,last_outbound_at,replied_at,needs_reply,is_snoozed,snoozed_until,assigned_to,last_inbound_label",
    )
    .eq("campaign_id", params.campaignId)
    .order("last_inbound_at", { ascending: sort === "oldest", nullsFirst: sort === "oldest" });

  if (needs !== "any") {
    query = query.eq("needs_reply", needs === "true");
  }

  if (snoozed === "hide") {
    query = query.or("snoozed_until.is.null,snoozed_until.lte.now()");
  } else if (snoozed === "only") {
    query = query.gt("snoozed_until", nowIso);
  }

  if (assigned === "me") {
    query = query.eq("assigned_to", me);
  } else if (assigned === "none") {
    query = query.is("assigned_to", null);
  }

  if (q) {
    const like = `%${q}%`;
    query = query.or(
      [
        `lead_name.ilike.${like}`,
        `lead_company.ilike.${like}`,
        `lead_email.ilike.${like}`,
        `id.ilike.${like}`,
      ].join(","),
    );
  }

  const { data, error } = await query.limit(200);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ items: data ?? [] });
}

