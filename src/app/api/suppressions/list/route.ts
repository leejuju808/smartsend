import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const service = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const scope = url.searchParams.get("scope") ?? "global";
  const accountId = url.searchParams.get("account_id");
  const campaignId = url.searchParams.get("campaign_id");
  const kind = url.searchParams.get("kind");

  let query = service.from("suppressions").select("*").eq("scope", scope);
  if (accountId) query = query.eq("account_id", accountId);
  if (campaignId) query = query.eq("campaign_id", campaignId);
  if (kind) query = query.eq("kind", kind);

  const { data, error } = await query.order("created_at", { ascending: false });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data ?? []);
}
