import { NextResponse } from "next/server";
import { variantBreakdown } from "@/lib/data/queue";

export async function GET(req: Request, { params }: { params: { id: string } }) {
  try {
    const url = new URL(req.url);
    const windowMin = Number(url.searchParams.get("windowMin") ?? 60);
    const rows = await variantBreakdown(params.id, windowMin);
    return NextResponse.json({ windowMin, rows }, { headers: { "Cache-Control": "no-store" } });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

