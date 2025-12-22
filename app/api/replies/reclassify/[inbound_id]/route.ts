import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";

export async function POST(
  _req: Request,
  { params }: { params: { inbound_id?: string } },
) {
  const inboundId = params.inbound_id;

  if (!inboundId) {
    return NextResponse.json({ error: "missing_inbound_id" }, { status: 400 });
  }

  const supabase = createServiceClient();

  const { error: deleteError } = await supabase
    .from("reply_classifications")
    .delete()
    .eq("inbound_id", inboundId);

  if (deleteError) {
    console.error("Failed to delete classification", deleteError);
    return NextResponse.json({ error: "delete_failed" }, { status: 500 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    console.error("Missing Supabase environment for reclassify");
    return NextResponse.json({ error: "env_not_configured" }, { status: 500 });
  }

  const classifyRes = await fetch(`${supabaseUrl}/functions/v1/reply-classify`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${serviceKey}`,
    },
    body: JSON.stringify({ inbound_ids: [inboundId], limit: 1 }),
  });

  if (!classifyRes.ok) {
    const detail = await safeJson(classifyRes);
    console.error("reply-classify edge failed", detail);
    return NextResponse.json({ error: "classify_failed", detail }, { status: 500 });
  }

  const body = await safeJson(classifyRes);

  return NextResponse.json({ ok: true, classified: body?.classified ?? 0 });
}

async function safeJson(res: Response) {
  try {
    return await res.json();
  } catch (_error) {
    return null;
  }
}

