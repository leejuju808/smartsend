// app/api/smartsend/run-send-engine/route.ts
// Block 8145 — Manual trigger for process-send-queue edge function

import { NextResponse } from "next/server";

const FUNCTIONS_URL = process.env.SUPABASE_FUNCTIONS_URL || process.env.NEXT_PUBLIC_SUPABASE_FUNCTIONS_URL;
// e.g. https://<project-ref>.functions.supabase.co

export async function POST() {
  if (!FUNCTIONS_URL) {
    return NextResponse.json(
      {
        ok: false,
        error: "Missing SUPABASE_FUNCTIONS_URL env var",
      },
      { status: 500 },
    );
  }

  try {
    const res = await fetch(`${FUNCTIONS_URL}/process-send-queue`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      // If later you want campaign-specific runs, you can POST { campaignId }
      body: JSON.stringify({}),
    });

    const body = await res.json().catch(() => ({}));

    if (!res.ok) {
      return NextResponse.json(
        {
          ok: false,
          error: body?.error ?? "Queue processor failed",
          details: body,
        },
        { status: 500 },
      );
    }

    return NextResponse.json(
      {
        ok: true,
        processed: body?.processed ?? null,
        results: body?.results ?? [],
      },
      { status: 200 },
    );
  } catch (error) {
    console.error("run-send-engine API error:", error);

    return NextResponse.json(
      {
        ok: false,
        error: "Unexpected error calling process-send-queue",
      },
      { status: 500 },
    );
  }
}

































































