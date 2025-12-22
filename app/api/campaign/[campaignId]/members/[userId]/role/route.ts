import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { z } from "zod";
import { assertOwner } from "@/lib/acl";

const Body = z.object({
  role: z.enum(["owner", "editor", "viewer"]),
});

export async function POST(
  req: NextRequest,
  { params }: { params: { campaignId: string; userId: string } },
) {
  try {
    await assertOwner(params.campaignId);
  } catch {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const supabase = createRouteHandlerClient({ cookies });
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { error } = await supabase
    .from("campaign_members")
    .update({ role: parsed.data.role })
    .eq("campaign_id", params.campaignId)
    .eq("user_id", params.userId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}



