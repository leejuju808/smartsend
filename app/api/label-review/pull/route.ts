import { NextResponse } from "next/server";

const EDGE_PATH = "/functions/v1/label-review-pull";

export async function POST(req: Request) {
  try {
    const body = await req.text();
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!url || !key) {
      return NextResponse.json(
        { error: "Missing Supabase configuration" },
        { status: 500 },
      );
    }

    const resp = await fetch(url + EDGE_PATH, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body,
    });

    const json = await resp.json().catch(() => null);
    return NextResponse.json(json ?? { error: "label-review-pull failed" }, {
      status: resp.status,
    });
  } catch (error) {
    console.error("label-review-pull proxy failed", error);
    return NextResponse.json(
      { error: "label-review-pull proxy failed" },
      { status: 500 },
    );
  }
}
















