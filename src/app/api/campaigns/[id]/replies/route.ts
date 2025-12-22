import { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const campaignId = params.id;
  const url = new URL(req.url);
  const label = url.searchParams.get("label");  // positive|neutral|negative|unsubscribe|ooo|bounce|other
  const q = url.searchParams.get("q");
  const limit = Math.min(parseInt(url.searchParams.get("limit") || "20", 10), 100);
  const offset = parseInt(url.searchParams.get("offset") || "0", 10);

  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const { data, error } = await admin.rpc("reply_quality_list", {
    p_campaign: campaignId,
    p_label: label,
    p_q: q,
    p_limit: limit,
    p_offset: offset
  });

  if (error) return new Response(error.message, { status: 400 });

  return new Response(JSON.stringify({ items: data ?? [], nextOffset: (data?.length || 0) < limit ? null : offset + limit }), {
    headers: { "content-type": "application/json", "cache-control": "no-store" }
  });
}

