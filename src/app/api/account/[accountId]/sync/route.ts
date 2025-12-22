import { NextRequest, NextResponse } from "next/server";

export async function POST(_: NextRequest, { params }: { params: { accountId: string } }) {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const secret = process.env.CRON_SECRET!;
  // Call both pullers; each filters by ?account=
  const [g, o] = await Promise.allSettled([
    fetch(`${base}/functions/v1/ingest-gmail?account=${params.accountId}`, {
      method: "POST",
      headers: { "x-cron-secret": secret },
    }),
    fetch(`${base}/functions/v1/ingest-outlook?account=${params.accountId}`, {
      method: "POST",
      headers: { "x-cron-secret": secret },
    }),
  ]);
  const ok = g.status === "fulfilled" || o.status === "fulfilled";
  return NextResponse.json({ ok });
}


