import { NextResponse } from "next/server";
import { listQueueItems } from "@/lib/data/queue";

export async function GET(req: Request, { params }: { params: { id: string } }) {
  const url = new URL(req.url);
  const state = (url.searchParams.get("state") ?? "any") as any;
  const q = url.searchParams.get("q") ?? undefined;
  const variant = url.searchParams.get("variant") ?? undefined;
  const attempts = (url.searchParams.get("attempts") ?? "any") as any;
  const limit = Number(url.searchParams.get("limit") ?? 50);
  const offset = Number(url.searchParams.get("offset") ?? 0);

  try {
    const { rows, total } = await listQueueItems({
      campaignId: params.id,
      state,
      q,
      variant,
      attempts,
      limit,
      offset,
    });

    return NextResponse.json({ rows, total });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "List failed" }, { status: 500 });
  }
}

