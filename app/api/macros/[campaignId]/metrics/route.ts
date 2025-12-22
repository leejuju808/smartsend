import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export async function GET(_: NextRequest, { params }: { params: { campaignId: string } }) {
  const authClient = createRouteHandlerClient({ cookies });
  const { data: isMember, error: memberError } = await authClient.rpc("is_campaign_member", {
    p_campaign: params.campaignId,
    p_roles: ["owner", "editor", "viewer"],
  });

  if (memberError) {
    return NextResponse.json({ error: memberError.message }, { status: 500 });
  }

  if (!isMember) {
    return NextResponse.json({ error: "not authorized" }, { status: 403 });
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  const { data, error } = await supabase
    .from("v_macro_usage_7d")
    .select("id,key,title,is_active,uses_7d")
    .eq("campaign_id", params.campaignId)
    .order("uses_7d", { ascending: false })
    .order("key", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data ?? []);
}








