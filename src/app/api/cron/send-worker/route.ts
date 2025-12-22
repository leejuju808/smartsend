import { NextResponse } from "next/server";

export const dynamic = "force-dynamic"; // allow on-demand

export async function GET() {
  try {
    const url = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/sendWorker`;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "x-worker-key": process.env.WORKER_SECRET || "",
        "Content-Type": "application/json",
      },
    });
    const json = await res.json();
    return NextResponse.json(json, { status: res.status });
  } catch (e: any) {
    return NextResponse.json({ ok: false, message: e.message }, { status: 500 });
  }
}