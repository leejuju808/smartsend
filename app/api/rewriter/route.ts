import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceRoleKey) {
      return NextResponse.json(
        { error: "Supabase configuration missing" },
        { status: 500 }
      );
    }

    const resp = await fetch(
      `${supabaseUrl}/functions/v1/rewrite-template`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${serviceRoleKey}`,
        },
        body: JSON.stringify(body),
      }
    );

    if (!resp.ok) {
      const errorData = await resp.json().catch(() => ({ error: "Unknown error" }));
      return NextResponse.json(
        { error: errorData.error || "Failed to rewrite template" },
        { status: resp.status }
      );
    }

    const data = await resp.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error("[rewriter API] Error:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to rewrite template",
      },
      { status: 500 }
    );
  }
}



