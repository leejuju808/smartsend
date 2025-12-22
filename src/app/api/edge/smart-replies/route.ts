import { NextRequest, NextResponse } from "next/server";

/**
 * API Proxy for Smart Replies Edge Function
 * This keeps the Supabase Edge Function secret URL off the client
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    
    // Forward to Supabase Edge Function
    const res = await fetch(
      `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/smartReplies`,
      {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "Authorization": `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`
        },
        body: JSON.stringify(body),
      }
    );
    
    const responseData = await res.json();
    
    return NextResponse.json(responseData, { status: res.status });
  } catch (error) {
    console.error("Error forwarding smart replies request:", error);
    return NextResponse.json(
      { error: "Internal server error" }, 
      { status: 500 }
    );
  }
}

