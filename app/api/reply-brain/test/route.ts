import { NextResponse } from "next/server";

export async function POST() {
  const fnUrl = process.env.NEXT_PUBLIC_SUPABASE_FUNCTIONS_URL || 
    `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1`;
  
  try {
    const r = await fetch(`${fnUrl}/reply-brain-worker`, {
      method: "POST",
      headers: { 
        Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY!}` 
      }
    });
    
    if (!r.ok) {
      const text = await r.text();
      return NextResponse.json(
        { error: `Function returned ${r.status}: ${text}` },
        { status: r.status }
      );
    }

    const json = await r.json();
    return NextResponse.json(json);
  } catch (error) {
    console.error("Test error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}















