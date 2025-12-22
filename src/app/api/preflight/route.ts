import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const payload = await req.json();
    
    const functionsUrl = process.env.NEXT_PUBLIC_SUPABASE_FUNCTIONS_URL || 
      `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1`;
    
    const r = await fetch(`${functionsUrl}/deliverabilityPreflight`, {
      method: "POST",
      headers: { 
        "Content-Type": "application/json", 
        "Authorization": `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}` 
      },
      body: JSON.stringify(payload)
    });
    
    const j = await r.json();
    return NextResponse.json(j, { status: r.status });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

