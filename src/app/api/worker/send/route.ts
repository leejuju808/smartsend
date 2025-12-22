import { NextRequest, NextResponse } from "next/server";

/**
 * Manual trigger API for send_worker (for debugging)
 * POST /api/worker/send
 */
export async function POST(_req: NextRequest) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseAnonKey) {
      return NextResponse.json(
        { error: "Missing Supabase configuration" },
        { status: 500 }
      );
    }

    const res = await fetch(`${supabaseUrl}/functions/v1/send_worker`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${supabaseAnonKey}`,
        "Content-Type": "application/json",
      },
    });

    const data = await res.json().catch(() => ({}));
    
    if (!res.ok) {
      return NextResponse.json(
        { error: data.error || "Worker execution failed", data },
        { status: res.status }
      );
    }

    return NextResponse.json(data);
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Internal error" },
      { status: 500 }
    );
  }
}
