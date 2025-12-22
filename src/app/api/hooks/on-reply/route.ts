import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const { message_id } = await req.json();
    
    if (!message_id) {
      return NextResponse.json({ error: "message_id required" }, { status: 400 });
    }

    const functionUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/reply-intent`;
    
    await fetch(functionUrl, {
      method: "POST",
      headers: { 
        "Content-Type": "application/json", 
        "Authorization": `Bearer ${process.env.SUPABASE_ANON_KEY}` 
      },
      body: JSON.stringify({ message_id })
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Error triggering reply intent classification:", error);
    return NextResponse.json({ error: "Failed to trigger classification" }, { status: 500 });
  }
}

