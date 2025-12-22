import { NextRequest, NextResponse } from "next/server";

export async function POST(_req: NextRequest, { params }: { params: { threadId: string } }) {
  const res = await fetch(
    `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/meeting-detect?thread_id=${params.threadId}`,
    {
      method: "POST",
      headers: { "x-cron-secret": process.env.NEXT_PUBLIC_CRON_SECRET ?? "" },
    },
  );

  const j = await res.json().catch(() => ({}));
  if (!res.ok) return NextResponse.json({ error: j?.error ?? "detect failed" }, { status: 500 });
  return NextResponse.json(j);
}



