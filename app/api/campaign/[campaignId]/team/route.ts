import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";

export async function GET(_: NextRequest, { params }: { params: { campaignId: string } }) {
  const supabase = createRouteHandlerClient({ cookies });
  const { data, error } = await supabase
    .from("campaign_members")
    .select("user_id, role, profiles:user_id(email, avatar_url)")
    .eq("campaign_id", params.campaignId)
    .order("role", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const team = (data ?? []).map((m: any) => ({
    id: m.user_id,
    role: m.role,
    email: m.profiles?.email ?? "",
    avatar_url: m.profiles?.avatar_url ?? null,
  }));

  return NextResponse.json({ team });
}




