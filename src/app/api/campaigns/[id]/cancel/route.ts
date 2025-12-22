import { NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const supabase = createRouteHandlerClient({ cookies });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await supabase.from("campaigns_new").update({ status: "cancelled" }).eq("id", params.id).eq("user_id", user.id);
  await supabase.from("campaign_recipients_new").update({ status: "cancelled" }).eq("campaign_id", params.id).eq("user_id", user.id).eq("status","pending");
  return NextResponse.json({ ok: true });
}

