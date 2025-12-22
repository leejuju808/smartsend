import { NextResponse } from "next/server";

export async function POST(req: Request) {
  const { campaign_id, lead_id, reason } = await req.json().catch(() => ({}));

  if (!campaign_id || !lead_id) {
    return NextResponse.json({ ok: false, error: "campaign_id and lead_id required" }, { status: 400 });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    return NextResponse.json({ ok: false, error: "supabase env not configured" }, { status: 500 });
  }

  const endpoint = `${url}/functions/v1/resume_lead_followups`;
  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${serviceKey}`,
    },
    body: JSON.stringify({ campaign_id, lead_id, reason }),
  });

  const data = await res.json().catch(() => ({ ok: false, error: "invalid_response" }));
  return NextResponse.json(data, { status: res.status });
}


