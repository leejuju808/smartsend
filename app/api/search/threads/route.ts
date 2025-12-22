import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

function parseBooleanFlag(value: string | null) {
  if (value === "1") return true;
  if (value === "0") return false;
  return null;
}

function parseNumber(value: string | null, fallback: number) {
  if (!value) return fallback;
  const parsed = Number(value);
  if (Number.isNaN(parsed) || parsed < 0) {
    return fallback;
  }
  return parsed;
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const campaignId = url.searchParams.get("campaignId");

  if (!campaignId) {
    return NextResponse.json({ error: "campaignId is required" }, { status: 400 });
  }

  const authClient = createRouteHandlerClient({ cookies });
  const {
    data: { user },
  } = await authClient.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { data: isMember, error: memberError } = await authClient.rpc("is_campaign_member", {
    p_campaign: campaignId,
    p_roles: ["owner", "editor", "viewer"],
  });

  if (memberError) {
    return NextResponse.json({ error: memberError.message }, { status: 500 });
  }

  if (!isMember) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  const params = {
    p_campaign: campaignId,
    p_q: url.searchParams.get("q") || null,
    p_label: url.searchParams.get("label") || null,
    p_domain: url.searchParams.get("domain") || null,
    p_assigned: url.searchParams.get("assigned") || null,
    p_has_links: parseBooleanFlag(url.searchParams.get("has_links")),
    p_overdue: parseBooleanFlag(url.searchParams.get("overdue")),
    p_ooo_today: parseBooleanFlag(url.searchParams.get("ooo_today")),
    p_date_from: url.searchParams.get("from"),
    p_date_to: url.searchParams.get("to"),
    p_limit: parseNumber(url.searchParams.get("limit"), 50),
    p_offset: parseNumber(url.searchParams.get("offset"), 0),
  };

  if (params.p_domain) {
    params.p_domain = params.p_domain.toLowerCase();
  }

  const { data, error } = await supabase.rpc("search_threads", params as Record<string, unknown>);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ rows: data ?? [] });
}






