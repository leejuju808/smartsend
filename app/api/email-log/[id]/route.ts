import { NextResponse } from "next/server";
import { getEmailLog } from "@/lib/data/email-log";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const row = await getEmailLog(params.id);
  if (!row) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true, log: row }, { headers: { "Cache-Control": "no-store" } });
}

