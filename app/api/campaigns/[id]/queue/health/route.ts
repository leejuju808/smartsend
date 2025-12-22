import { NextResponse } from "next/server";
import { queueHealthStats } from "@/lib/data/queue";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  try {
    const stats = await queueHealthStats(params.id);
    return NextResponse.json(stats, { headers: { "Cache-Control": "no-store" } });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

