import { NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";

export async function POST(_: Request, { params }: { params: { id: string } }) {
  const supabase = createRouteHandlerClient({ cookies });
  const { data: me } = await supabase.auth.getUser();
  const uid = me?.user?.id;

  if (!uid) {
    return NextResponse.json({ error: "Not authed" }, { status: 401 });
  }

  const { error } = await supabase
    .from("campaign_members")
    .delete()
    .eq("campaign_id", params.id)
    .eq("user_id", uid);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}



