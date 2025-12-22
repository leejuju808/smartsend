import { NextResponse } from "next/server";
import { setSuppPrefs } from "@/lib/db/suppPrefs";

export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  const body = await req.json();

  await setSuppPrefs(params.id, {
    respect_global_suppressions: !!body.respect_global_suppressions,
    respect_cross_campaign_unsubs: !!body.respect_cross_campaign_unsubs,
    respect_domain_blocks: !!body.respect_domain_blocks,
  });

  return NextResponse.json({ ok: true });
}












