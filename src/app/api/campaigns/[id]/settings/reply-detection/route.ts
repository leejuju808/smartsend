// app/api/campaigns/[id]/settings/reply-detection/route.ts
import { NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";

export async function PATCH(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const { enabled } = (await req.json()) as { enabled: boolean };
    const supabase = createRouteHandlerClient({ cookies });

    // Only owner can flip campaign settings
    const { data: role, error: roleError } = await supabase.rpc(
      "get_user_campaign_role",
      { p_campaign: params.id }
    );

    if (roleError || role !== "owner") {
      return NextResponse.json({ error: "not authorized" }, { status: 403 });
    }

    const { error } = await supabase
      .from("campaigns")
      .update({ auto_reply_detection: !!enabled })
      .eq("id", params.id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    console.error("Error updating reply detection setting:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

