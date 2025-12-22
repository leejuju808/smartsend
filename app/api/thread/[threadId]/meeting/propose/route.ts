import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest, { params }: { params: { threadId: string } }) {
  const mode = new URL(req.url).searchParams.get("mode") ?? "draft";
  const res = await fetch(
    `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/meeting-propose?thread_id=${params.threadId}&mode=${mode}`,
    {
      method: "POST",
      headers: { "x-cron-secret": process.env.NEXT_PUBLIC_CRON_SECRET ?? "" },
    },
  );

  const j = await res.json().catch(() => ({}));
  if (!res.ok) return NextResponse.json({ error: j?.error ?? "propose failed" }, { status: 500 });
  return NextResponse.json(j);
}



