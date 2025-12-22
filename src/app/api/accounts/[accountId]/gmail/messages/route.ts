import { NextRequest, NextResponse } from "next/server";

export async function GET(_: NextRequest, { params }: { params: { accountId: string } }) {
  const res = await fetch(
    `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/inbox_sync_gmail?account_id=${params.accountId}`,
    {
      headers: { "x-cron-secret": process.env.NEXT_PUBLIC_CRON_SECRET ?? "" },
    },
  );

  const json = await res.json().catch(() => ({}));
  if (!res.ok) return NextResponse.json(json, { status: res.status });
  return NextResponse.json(json);
}




