import { NextResponse } from "next/server";

const EDGE_PATH = "/functions/v1/active-enqueue";

export async function POST() {
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!url || !key) {
      return NextResponse.json(
        { ok: false, error: "Missing Supabase configuration" },
        { status: 500 },
      );
    }

    const resp = await fetch(url + EDGE_PATH, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
      },
    });

    const json = await resp.json().catch(() => null);
    return NextResponse.json(json ?? { ok: false }, { status: resp.status });
  } catch (error) {
    console.error("active-enqueue proxy failed", error);
    return NextResponse.json(
      { ok: false, error: "active-enqueue proxy failed" },
      { status: 500 },
    );
  }
}

















