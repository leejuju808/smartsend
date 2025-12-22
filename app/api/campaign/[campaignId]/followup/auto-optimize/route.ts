import { NextRequest, NextResponse } from "next/server";
import { assertEditor } from "@/lib/acl";

export async function POST(_req: NextRequest, { params }: { params: { campaignId: string } }) {
  try {
    await assertEditor(params.campaignId);
  } catch {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_FUNCTIONS_URL;
  const svcKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!baseUrl || !svcKey) {
    return NextResponse.json({ error: "missing_env" }, { status: 500 });
  }

  const r = await fetch(`${baseUrl}/followup-auto-optimize`, {
    method: "POST",
    headers: { Authorization: `Bearer ${svcKey}` },
  });

  const j = await r.json().catch(() => ({}));

  if (!r.ok) {
    return NextResponse.json({ error: j.error ?? "opt_failed" }, { status: 500 });
  }

  const items = Array.isArray(j.items) ? j.items : [];
  const item = items.find((x: any) => x?.campaign_id === params.campaignId) ?? null;

  return NextResponse.json({ ok: true, item });
}

