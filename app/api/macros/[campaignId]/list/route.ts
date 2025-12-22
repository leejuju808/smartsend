import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export async function GET(req: NextRequest, { params }: { params: { campaignId: string } }) {
  const authClient = createRouteHandlerClient({ cookies });
  const { data: isMember, error: memberError } = await authClient.rpc("is_campaign_member", {
    p_campaign: params.campaignId,
  });

  if (memberError) {
    return NextResponse.json({ error: memberError.message }, { status: 500 });
  }

  if (!isMember) {
    return NextResponse.json({ error: "not authorized" }, { status: 403 });
  }

  const searchParams = new URL(req.url).searchParams;
  const query = searchParams.get("q")?.trim();
  const includeInactive = searchParams.get("include_inactive") === "1";
  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  let sel = supabase
    .from("reply_macros")
    .select("id,key,title,tags,body,is_active")
    .eq("campaign_id", params.campaignId);

  if (!includeInactive) {
    sel = sel.eq("is_active", true);
  }

  if (query) {
    const safe = query.replace(/[{}]/g, "");
    sel = sel.or(
      ["key", "title"].map((col) => `${col}.ilike.%${safe}%`).concat(`tags.cs.{${safe.toLowerCase()}}`).join(",")
    );
  }

  const { data, error } = await sel.order("key", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data ?? []);
}


